import { meetingRole, plugNmeetRequest, plugNmeetRoom, type PlugNmeetEnv } from '../../_lib/plugnmeet';

type Context = { request: Request; env: PlugNmeetEnv };

type ActiveResponse = { status?: boolean; msg?: string; is_active?: boolean };
type JoinResponse = { status?: boolean; msg?: string; token?: string };

function roomMetadata(title: string, origin: string) {
  return {
    room_title: title,
    welcome_message: '',
    logout_url: `${origin}/meet/`,
    room_features: {
      allow_webcams: true,
      mute_on_start: false,
      allow_screen_share: true,
      admin_only_webcams: false,
      allow_view_other_webcams: true,
      allow_view_other_users_list: true,
      enable_analytics: true,
      allow_virtual_bg: true,
      allow_raise_hand: true,
      auto_gen_user_id: true,
      room_duration: 0,
      recording_features: {
        is_allow: true,
        is_allow_cloud: true,
        is_allow_local: true,
        enable_auto_cloud_recording: false,
        only_record_admin_webcams: false,
      },
      chat_features: { is_allow: true, is_allow_file_upload: true },
      shared_note_pad_features: { is_allow: true },
      whiteboard_features: { is_allow: true },
      external_media_player_features: { is_allow: true },
      external_broadcasting_features: { is_allow: true, is_allow_rtmp: true },
      waiting_room_features: { is_active: true },
      breakout_room_features: { is_allow: false, allowed_number_rooms: 6, allow_return_to_main_room: true, allow_self_select: false },
      display_external_link_features: { is_allow: true },
      ingress_features: { is_allow: true },
      polls_features: { is_allow: true },
      sip_dial_in_features: { is_allow: false, enable_dial_in_on_create: false, hide_phone_number: false },
      end_to_end_encryption_features: { is_enabled: false, enabled_self_insert_encryption_key: false },
    },
    default_lock_settings: {
      lock_microphone: false,
      lock_webcam: false,
      lock_screen_sharing: false,
      lock_whiteboard: false,
      lock_shared_notepad: false,
      lock_chat: false,
      lock_chat_send_message: false,
      lock_chat_file_share: false,
      lock_private_chat: false,
    },
  };
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = clean(body.name, 80);
    const password = clean(body.password, 160);
    const website = clean(body.website, 120);
    if (website) return Response.json({ ok: true });
    if (name.length < 2) return Response.json({ error: 'Please enter your name.' }, { status: 400 });

    const { isAdmin } = await meetingRole(env, password);
    const { roomId, roomTitle } = plugNmeetRoom(env);
    const active = await plugNmeetRequest<ActiveResponse>(env, '/room/isRoomActive', { room_id: roomId });

    if (!active.is_active) {
      await plugNmeetRequest(env, '/room/create', {
        room_id: roomId,
        max_participants: 1000,
        empty_timeout: 300,
        metadata: roomMetadata(roomTitle, new URL(request.url).origin),
      });
    }

    const joined = await plugNmeetRequest<JoinResponse>(env, '/room/getJoinToken', {
      room_id: roomId,
      user_info: {
        name,
        user_id: crypto.randomUUID(),
        is_admin: isAdmin,
        is_hidden: false,
        client_type: 'WEB',
        user_metadata: {
          preferred_lang: 'en-US',
          record_webcam: true,
          extra_data: { source: 'trantergrey.com/meet' },
        },
      },
    });

    if (!joined.token) throw new Error('The meeting service did not return an access token.');
    return Response.json({ ok: true, token: joined.token });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The meeting room is temporarily unavailable.';
    const expected = /password|name/i.test(message);
    return Response.json({ error: expected ? message : 'The meeting room is temporarily unavailable. Please try again.' }, { status: expected ? 400 : 502 });
  }
}
