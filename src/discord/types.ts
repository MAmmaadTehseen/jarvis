/** The slice of Discord's interaction API that Jarvis actually uses. */

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  MODAL: 9,
} as const;

export const ComponentType = {
  ACTION_ROW: 1,
  TEXT_INPUT: 4,
} as const;

export const TextInputStyle = {
  SHORT: 1,
  PARAGRAPH: 2,
} as const;

export const OptionType = {
  STRING: 3,
  INTEGER: 4,
} as const;

/** Message flag 1 << 6: only the invoking user sees the reply. */
export const EPHEMERAL = 64;

export interface CommandOption {
  name: string;
  type: number;
  value?: string | number;
}

export interface ModalField {
  custom_id: string;
  value: string;
}

export interface Interaction {
  type: number;
  id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: { id: string; username?: string } };
  user?: { id: string; username?: string };
  data?: {
    name?: string;
    custom_id?: string;
    options?: CommandOption[];
    components?: { components?: ModalField[] }[];
  };
}

export interface InteractionResponse {
  type: number;
  data?: Record<string, unknown>;
}

/** The user id behind either a guild interaction or a DM one. */
export function userIdOf(interaction: Interaction): string | undefined {
  return interaction.member?.user?.id ?? interaction.user?.id;
}

export function optionValue(interaction: Interaction, name: string): string | number | undefined {
  return interaction.data?.options?.find((o) => o.name === name)?.value;
}

export function stringOption(interaction: Interaction, name: string): string | undefined {
  const v = optionValue(interaction, name);
  return typeof v === "string" ? v : undefined;
}

export function intOption(interaction: Interaction, name: string): number | undefined {
  const v = optionValue(interaction, name);
  return typeof v === "number" ? v : undefined;
}

/** Flattens a modal submission's nested action rows into custom_id -> value. */
export function modalValues(interaction: Interaction): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of interaction.data?.components ?? []) {
    for (const field of row.components ?? []) {
      if (field?.custom_id) out[field.custom_id] = field.value ?? "";
    }
  }
  return out;
}
