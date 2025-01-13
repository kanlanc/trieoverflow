import { http } from "@hypermode/modus-sdk-as";
import { DiscordMessage } from "./classes";

export function getInitialMessagesFromDiscord(
  numOfMessages: number = 50,
  discordChannelId: string = "1292948253796466730",
): DiscordMessage[] {
  // This by default is only for Modus

  const response = http.fetch(
    `https://discord.com/api/v10/channels/${discordChannelId}/messages?limit=${numOfMessages}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Discord messages: ${response.status}`);
  }

  return response.json<DiscordMessage[]>();
}
