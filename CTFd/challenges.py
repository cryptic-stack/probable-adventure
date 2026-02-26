from flask import Blueprint, redirect, render_template, request, url_for
from flask_babel import lazy_gettext as _l
from sqlalchemy.sql import and_

from CTFd.constants.config import ChallengeVisibilityTypes, Configs
from CTFd.models import Challenges
from CTFd.utils.challenge_runtime import activate_challenge_container
from CTFd.utils.config import is_teams_mode
from CTFd.utils.dates import ctf_ended, ctf_paused, ctf_started
from CTFd.utils.decorators import (
    during_ctf_time_only,
    require_complete_profile,
    require_verified_emails,
)
from CTFd.utils.decorators.visibility import check_challenge_visibility
from CTFd.utils.helpers import get_errors, get_infos
from CTFd.utils.user import authed, get_current_team, is_admin

challenges = Blueprint("challenges", __name__)


@challenges.route("/challenges", methods=["GET"])
@require_complete_profile
@during_ctf_time_only
@require_verified_emails
@check_challenge_visibility
def listing():
    if (
        Configs.challenge_visibility == ChallengeVisibilityTypes.PUBLIC
        and authed() is False
    ):
        pass
    else:
        if is_teams_mode() and get_current_team() is None:
            return redirect(url_for("teams.private", next=request.full_path))

    infos = get_infos()
    errors = get_errors()

    if Configs.challenge_visibility == ChallengeVisibilityTypes.ADMINS:
        infos.append(_l("Challenge Visibility is set to Admins Only"))

    if ctf_started() is False:
        errors.append(_l("%(ctf_name)s has not started yet", ctf_name=Configs.ctf_name))

    if ctf_paused() is True:
        infos.append(_l("%(ctf_name)s is paused", ctf_name=Configs.ctf_name))

    if ctf_ended() is True:
        infos.append(_l("%(ctf_name)s has ended", ctf_name=Configs.ctf_name))

    return render_template("challenges.html", infos=infos, errors=errors)


@challenges.route("/challenges/<int:challenge_id>/launch", methods=["GET"])
@require_complete_profile
@during_ctf_time_only
@require_verified_emails
@check_challenge_visibility
def launch(challenge_id):
    if is_admin():
        challenge = Challenges.query.filter(Challenges.id == challenge_id).first_or_404()
    else:
        challenge = Challenges.query.filter(
            Challenges.id == challenge_id,
            and_(Challenges.state != "hidden", Challenges.state != "locked"),
        ).first_or_404()

    data, error = activate_challenge_container(challenge)
    if error:
        return redirect(url_for("challenges.listing"))

    launch_url = (data or {}).get("url")
    if not launch_url:
        return redirect(url_for("challenges.listing"))
    return redirect(launch_url)
