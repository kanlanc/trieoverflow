
@json
export class DiscordMessage {
  type!: number;
  content!: string;
  mentions!: Array<string>;
  mention_roles!: Array<string>;
  attachments!: Array<string>;
  embeds!: Array<string>;
  timestamp!: string;
  edited_timestamp!: string;
  flags!: number;
  components!: Array<string>;
  id!: string;
  channel_id!: string;
  author!: Author;
  pinned!: boolean;
  mention_everyone!: boolean;
  tts!: boolean;
  message_reference!: MessageReference | null;
  thread!: Thread | null;
  position!: number;
}


@json
class Author {
  id!: string;
  username!: string;
  avatar!: string;
  discriminator!: string;
  public_flags!: number;
  flags!: number;
  banner!: string;
  accent_color!: number;
  global_name!: string;
  avatar_decoration_data!: string;
  banner_color!: string;
  clan!: string;
  primary_guild!: string;
}


@json
export class Thread {
  id!: string;
  type!: number;
  last_message_id!: string;
  flags!: number;
  guild_id!: string;
  name!: string;
  parent_id!: string;
  rate_limit_per_user!: number;
  bitrate!: number;
  user_limit!: number;
  rtc_region!: string;
  owner_id!: string;
  thread_metadata!: ThreadMetadata;
  message_count!: number;
  member_count!: number;
  total_message_sent!: number;
  member_ids_preview!: Array<string>;
}


@json
class ThreadMetadata {
  archived!: boolean;
  archive_timestamp!: string;
  auto_archive_duration!: number;
  locked!: boolean;
  create_timestamp!: string;
}


@json
class MessageReference {
  type!: number;
  channel_id!: string;
  guild_id!: string;
}
