CTFd.plugin.run((_CTFd) => {
  const $ = _CTFd.lib.$;
  const ACCESS_SCHEMA = "ctfd-access-v1";

  function parseConnectionInfo(raw) {
    const value = (raw || "").trim();
    if (!value) {
      return { type: "", url: "", host: "", port: "", username: "", password: "", instructions: "" };
    }

    try {
      const parsed = JSON.parse(value);
      if (parsed && parsed.schema === ACCESS_SCHEMA) {
        return {
          type: parsed.type || "",
          url: parsed.url || "",
          host: parsed.host || "",
          port: parsed.port || "",
          username: parsed.username || "",
          password: parsed.password || "",
          instructions: parsed.instructions || "",
          provision: parsed.provision || {},
        };
      }
    } catch (_e) {}

    if (/^https?:\/\//i.test(value)) {
      return { type: "url", url: value, host: "", port: "", username: "", password: "", instructions: "", provision: {} };
    }

    return { type: "plain", url: "", host: "", port: "", username: "", password: "", instructions: value, provision: {} };
  }

  function buildConnectionInfo(data) {
    const type = (data.type || "").trim();
    const url = (data.url || "").trim();
    const host = (data.host || "").trim();
    const port = (data.port || "").trim();
    const username = (data.username || "").trim();
    const password = (data.password || "").trim();
    const instructions = (data.instructions || "").trim();
    const provisionEnabled = Boolean(data.provision_enabled);
    const provisionImage = (data.provision_image || "").trim();
    const provisionFlag = (data.provision_flag || "").trim();
    const provisionStartup = (data.provision_startup || "").trim();
    let provisionPort = (data.provision_port || "").toString().trim();
    provisionPort = provisionPort ? parseInt(provisionPort, 10) : null;

    if (!type && !url && !host && !port && !username && !password && !instructions && !provisionEnabled && !provisionImage) {
      return "";
    }

    if (type === "plain") {
      return instructions;
    }

    const payload = {
      schema: ACCESS_SCHEMA,
      type: type || "url",
      url,
      host,
      port,
      username,
      password,
      instructions,
      provision: {
        enabled: provisionEnabled,
        image: provisionImage,
        flag: provisionFlag,
        internal_port: Number.isInteger(provisionPort) ? provisionPort : null,
        startup_command: provisionStartup,
      },
    };
    return JSON.stringify(payload);
  }

  function bindAccessBuilder($form) {
    const $raw = $form.find(".chal-connection-info");
    const $type = $form.find(".chal-access-type");
    const $url = $form.find(".chal-access-url");
    const $host = $form.find(".chal-access-host");
    const $port = $form.find(".chal-access-port");
    const $username = $form.find(".chal-access-username");
    const $password = $form.find(".chal-access-password");
    const $instructions = $form.find(".chal-access-instructions");
    const $provisionEnabled = $form.find(".chal-provision-enabled");
    const $provisionImage = $form.find(".chal-provision-image");
    const $provisionPort = $form.find(".chal-provision-port");
    const $provisionFlag = $form.find(".chal-provision-flag");
    const $provisionStartup = $form.find(".chal-provision-startup");

    if (!$raw.length || !$type.length) {
      return;
    }

    function hydrateFromRaw() {
      const data = parseConnectionInfo($raw.val());
      $type.val(data.type);
      $url.val(data.url);
      $host.val(data.host);
      $port.val(data.port);
      $username.val(data.username);
      $password.val(data.password);
      $instructions.val(data.instructions);
      const provision = data.provision || {};
      $provisionEnabled.prop("checked", Boolean(provision.enabled));
      $provisionImage.val(provision.image || "");
      $provisionPort.val(provision.internal_port || "");
      $provisionFlag.val(provision.flag || "");
      $provisionStartup.val(provision.startup_command || "");
    }

    function syncRawFromBuilder() {
      $raw.val(
        buildConnectionInfo({
          type: $type.val(),
          url: $url.val(),
          host: $host.val(),
          port: $port.val(),
          username: $username.val(),
          password: $password.val(),
          instructions: $instructions.val(),
          provision_enabled: $provisionEnabled.is(":checked"),
          provision_image: $provisionImage.val(),
          provision_port: $provisionPort.val(),
          provision_flag: $provisionFlag.val(),
          provision_startup: $provisionStartup.val(),
        }),
      );
    }

    hydrateFromRaw();
    $raw.on("change blur", hydrateFromRaw);
    $type.add($url).add($host).add($port).add($username).add($password).add($instructions).add($provisionEnabled).add($provisionImage).add($provisionPort).add($provisionFlag).add($provisionStartup).on("input change", syncRawFromBuilder);
  }

  bindAccessBuilder($("#create-chal-entry-div form"));
});
