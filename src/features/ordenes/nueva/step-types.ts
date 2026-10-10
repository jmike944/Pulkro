import type { Dispatch, SetStateAction } from "react";
import type { Draft, Issues } from "./draft";

export type StepProps = {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  issues: Issues;
  /** Error for a field, only once the person has interacted with it. */
  errorOf: (field: string) => string | undefined;
  touch: (field: string) => void;
};
