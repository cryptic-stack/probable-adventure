package provisioner

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	"github.com/cryptic-stack/probable-adventure/internal/jobs"
	tmpl "github.com/cryptic-stack/probable-adventure/internal/templates"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Worker struct {
	store  *jobs.Store
	q      *sqlc.Queries
	docker *client.Client
	id     string
}

func NewWorker(pool *pgxpool.Pool, workerID string, dockerHost string) (*Worker, error) {
	opts := []client.Opt{client.FromEnv, client.WithAPIVersionNegotiation()}
	if strings.TrimSpace(dockerHost) != "" {
		opts = append(opts, client.WithHost(dockerHost))
	}
	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, err
	}
	return &Worker{store: jobs.NewStore(pool), q: sqlc.New(pool), docker: cli, id: workerID}, nil
}

func (w *Worker) Run(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		job, err := w.store.ClaimNextJob(ctx, w.id)
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		if job == nil {
			time.Sleep(w.store.PollInterval())
			continue
		}
		if err := w.handleJob(ctx, job); err != nil {
			_ = w.emit(ctx, job.RangeID, &job.ID, "error", "job.failed", err.Error(), nil)
			_ = w.store.UpdateRangeStatus(ctx, job.RangeID, "failed", nil)
			_ = w.store.FailJob(ctx, job.ID, err.Error())
			continue
		}
		_ = w.store.CompleteJob(ctx, job.ID)
	}
}

func (w *Worker) handleJob(ctx context.Context, job *jobs.ClaimedJob) error {
	switch job.JobType {
	case "provision":
		return w.provision(ctx, job)
	case "destroy":
		return w.destroy(ctx, job)
	case "reset":
		if err := w.destroy(ctx, job); err != nil {
			return err
		}
		return w.provision(ctx, job)
	default:
		return fmt.Errorf("unsupported job type %s", job.JobType)
	}
}

func labels(rangeID, teamID, templateID int64, service string) map[string]string {
	return map[string]string{
		"range_id":     strconv.FormatInt(rangeID, 10),
		"team_id":      strconv.FormatInt(teamID, 10),
		"template_id":  strconv.FormatInt(templateID, 10),
		"service_name": service,
	}
}

func (w *Worker) provision(ctx context.Context, job *jobs.ClaimedJob) error {
	_ = w.emit(ctx, job.RangeID, &job.ID, "info", "provision.start", "provisioning started", nil)
	_ = w.store.UpdateRangeStatus(ctx, job.RangeID, "provisioning", nil)
	templateID, rawDef, err := w.store.GetRangeTemplate(ctx, job.RangeID)
	if err != nil {
		return err
	}
	var def tmpl.Definition
	if err := json.Unmarshal(rawDef, &def); err != nil {
		return err
	}
	segments := map[string]struct{}{}
	for _, svc := range def.Services {
		segments[tmpl.NormalizeNetwork(svc.Network)] = struct{}{}
	}
	networkNames := map[string]string{}
	networkIDs := map[string]string{}
	resources := []jobs.Resource{}
	for segment := range segments {
		netName := fmt.Sprintf("range_%d_%s", job.RangeID, segment)
		netID, err := w.ensureNetwork(ctx, job, templateID, segment, netName)
		if err != nil {
			return fmt.Errorf("ensure network %s: %w", segment, err)
		}
		networkNames[segment] = netName
		networkIDs[segment] = netID
		_ = w.emit(ctx, job.RangeID, &job.ID, "info", "provision.network", "network ready", map[string]any{"network_id": netID, "name": netName, "segment": segment})
		resources = append(resources, jobs.Resource{
			ResourceType: "network",
			DockerID:     netID,
			ServiceName:  "network-" + segment,
			Metadata:     []byte(`{"name":"` + netName + `","segment":"` + segment + `"}`),
		})
	}

	portsMeta := map[string]any{}
	for _, svc := range def.Services {
		segment := tmpl.NormalizeNetwork(svc.Network)
		if err := w.pullImage(ctx, svc.Image); err != nil {
			return fmt.Errorf("pull image %s: %w", svc.Image, err)
		}
		_ = w.emit(ctx, job.RangeID, &job.ID, "info", "provision.image", "image ready "+svc.Image, map[string]any{"service_name": svc.Name})
		exposed := nat.PortSet{}
		bindings := nat.PortMap{}
		for _, p := range svc.ExposedPorts {
			proto := strings.ToLower(strings.TrimSpace(p.Protocol))
			if proto == "" {
				proto = "tcp"
			}
			if proto != "udp" {
				proto = "tcp"
			}
			port := nat.Port(fmt.Sprintf("%d/%s", p.Container, proto))
			exposed[port] = struct{}{}
			hp := ""
			if p.Host > 0 {
				hp = strconv.Itoa(p.Host)
			}
			bindings[port] = []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: hp}}
		}
		cfg := &container.Config{Image: svc.Image, Cmd: svc.Command, Env: buildServiceEnv(def, svc), ExposedPorts: exposed, Labels: labels(job.RangeID, job.TeamID, templateID, svc.Name)}
		hcfg := &container.HostConfig{PortBindings: bindings}
		ncfg := &network.NetworkingConfig{EndpointsConfig: map[string]*network.EndpointSettings{
			networkNames[segment]: &network.EndpointSettings{NetworkID: networkIDs[segment]},
		}}
		name := fmt.Sprintf("range_%d_%s", job.RangeID, svc.Name)
		containerID, created, err := w.ensureContainer(ctx, job, templateID, svc.Name, name, cfg, hcfg, ncfg)
		if err != nil {
			return err
		}
		if created {
			_ = w.emit(ctx, job.RangeID, &job.ID, "info", "provision.service.create", "created service "+svc.Name, map[string]any{"docker_id": containerID})
		} else {
			_ = w.emit(ctx, job.RangeID, &job.ID, "info", "provision.service.reuse", "reused service "+svc.Name, map[string]any{"docker_id": containerID})
		}
		if err := w.docker.ContainerStart(ctx, containerID, container.StartOptions{}); err != nil {
			// Safe to ignore when container is already running.
			if !strings.Contains(strings.ToLower(err.Error()), "already started") {
				return err
			}
		}
		if err := w.waitHealthy(ctx, containerID, svc.Healthcheck); err != nil {
			return err
		}
		inspect, err := w.docker.ContainerInspect(ctx, containerID)
		if err == nil {
			portsMeta[svc.Name] = inspect.NetworkSettings.Ports
		}
		resources = append(resources, jobs.Resource{
			ResourceType: "container",
			DockerID:     containerID,
			ServiceName:  svc.Name,
			Metadata:     []byte(`{"network":"` + segment + `","image":"` + svc.Image + `"}`),
		})
		_ = w.emit(ctx, job.RangeID, &job.ID, "info", "provision.service", "started service "+svc.Name, map[string]any{"docker_id": containerID})
		_ = w.emit(ctx, job.RangeID, &job.ID, "info", "provision.health", "healthy service "+svc.Name, nil)
	}
	b, _ := json.Marshal(map[string]any{"ports": portsMeta})
	if err := w.store.ReplaceRangeResources(ctx, job.RangeID, resources); err != nil {
		return err
	}
	if err := w.store.UpdateRangeStatus(ctx, job.RangeID, "ready", b); err != nil {
		return err
	}
	_ = w.emit(ctx, job.RangeID, &job.ID, "info", "provision.done", "range ready", map[string]any{"ports": portsMeta})
	return nil
}

func (w *Worker) destroy(ctx context.Context, job *jobs.ClaimedJob) error {
	_ = w.emit(ctx, job.RangeID, &job.ID, "info", "destroy.start", "destroy started", nil)
	_ = w.store.UpdateRangeStatus(ctx, job.RangeID, "destroying", nil)

	cs, err := w.docker.ContainerList(ctx, container.ListOptions{All: true, Filters: filters.NewArgs(filters.Arg("label", "range_id="+strconv.FormatInt(job.RangeID, 10)))})
	if err != nil {
		return err
	}
	for _, c := range cs {
		if err := w.docker.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true, RemoveVolumes: true}); err == nil {
			_ = w.emit(ctx, job.RangeID, &job.ID, "info", "destroy.container", "removed container", map[string]any{"docker_id": c.ID})
		}
	}
	ns, err := w.docker.NetworkList(ctx, network.ListOptions{Filters: filters.NewArgs(filters.Arg("label", "range_id="+strconv.FormatInt(job.RangeID, 10)))})
	if err != nil {
		return err
	}
	for _, n := range ns {
		if err := w.docker.NetworkRemove(ctx, n.ID); err == nil {
			_ = w.emit(ctx, job.RangeID, &job.ID, "info", "destroy.network", "removed network", map[string]any{"docker_id": n.ID})
		}
	}

	if err := w.store.ReplaceRangeResources(ctx, job.RangeID, nil); err != nil {
		return err
	}
	if err := w.store.UpdateRangeStatus(ctx, job.RangeID, "destroyed", []byte(`{"ports":{}}`)); err != nil {
		return err
	}
	_ = w.emit(ctx, job.RangeID, &job.ID, "info", "destroy.done", "range destroyed", nil)
	return nil
}

func (w *Worker) emit(ctx context.Context, rangeID int64, jobID *int64, level, kind, msg string, payload map[string]any) error {
	var b []byte
	if payload == nil {
		b = []byte(`{}`)
	} else {
		b, _ = json.Marshal(payload)
	}
	_, err := w.q.InsertEvent(ctx, rangeID, jobID, level, kind, msg, b)
	return err
}

func (w *Worker) pullImage(ctx context.Context, imageRef string) error {
	// If the image is already present locally (for example, locally built base images),
	// skip remote pull and proceed.
	if _, _, err := w.docker.ImageInspectWithRaw(ctx, imageRef); err == nil {
		return nil
	}

	rc, err := w.docker.ImagePull(ctx, imageRef, image.PullOptions{})
	if err != nil {
		return err
	}
	defer rc.Close()
	_, _ = io.Copy(io.Discard, rc)
	return nil
}

func (w *Worker) ensureNetwork(ctx context.Context, job *jobs.ClaimedJob, templateID int64, segment, netName string) (string, error) {
	lbls := labels(job.RangeID, job.TeamID, templateID, "network-"+segment)
	lbls["network_segment"] = segment
	fl := filters.NewArgs(
		filters.Arg("label", "range_id="+strconv.FormatInt(job.RangeID, 10)),
		filters.Arg("label", "team_id="+strconv.FormatInt(job.TeamID, 10)),
		filters.Arg("label", "template_id="+strconv.FormatInt(templateID, 10)),
		filters.Arg("label", "service_name=network-"+segment),
	)
	networks, err := w.docker.NetworkList(ctx, network.ListOptions{Filters: fl})
	if err != nil {
		return "", err
	}
	if len(networks) > 0 {
		return networks[0].ID, nil
	}
	created, err := w.docker.NetworkCreate(ctx, netName, network.CreateOptions{Labels: lbls})
	if err != nil {
		return "", err
	}
	return created.ID, nil
}

func (w *Worker) ensureContainer(ctx context.Context, job *jobs.ClaimedJob, templateID int64, serviceName, name string, cfg *container.Config, hcfg *container.HostConfig, ncfg *network.NetworkingConfig) (string, bool, error) {
	fl := filters.NewArgs(
		filters.Arg("label", "range_id="+strconv.FormatInt(job.RangeID, 10)),
		filters.Arg("label", "team_id="+strconv.FormatInt(job.TeamID, 10)),
		filters.Arg("label", "template_id="+strconv.FormatInt(templateID, 10)),
		filters.Arg("label", "service_name="+serviceName),
	)
	containers, err := w.docker.ContainerList(ctx, container.ListOptions{All: true, Filters: fl})
	if err != nil {
		return "", false, err
	}
	if len(containers) > 0 {
		return containers[0].ID, false, nil
	}
	created, err := w.docker.ContainerCreate(ctx, cfg, hcfg, ncfg, nil, name)
	if err != nil {
		return "", false, err
	}
	return created.ID, true, nil
}

func (w *Worker) waitHealthy(ctx context.Context, containerID string, explicitCheck string) error {
	timeoutCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeoutCtx.Done():
			return fmt.Errorf("health check timeout: %w", timeoutCtx.Err())
		case <-ticker.C:
			if explicitCheck != "" {
				execResp, err := w.docker.ContainerExecCreate(timeoutCtx, containerID, container.ExecOptions{Cmd: []string{"sh", "-lc", explicitCheck}})
				if err != nil {
					continue
				}
				if err := w.docker.ContainerExecStart(timeoutCtx, execResp.ID, container.ExecStartOptions{}); err != nil {
					continue
				}
				ins, err := w.docker.ContainerExecInspect(timeoutCtx, execResp.ID)
				if err == nil && !ins.Running && ins.ExitCode == 0 {
					return nil
				}
				continue
			}
			inspect, err := w.docker.ContainerInspect(timeoutCtx, containerID)
			if err != nil {
				continue
			}
			if inspect.State == nil {
				continue
			}
			if inspect.State.Health != nil {
				switch inspect.State.Health.Status {
				case "healthy":
					return nil
				case "unhealthy":
					return fmt.Errorf("container unhealthy")
				}
				continue
			}
			if inspect.State.Running {
				return nil
			}
		}
	}
}
