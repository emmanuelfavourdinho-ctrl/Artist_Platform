export interface ApiFieldIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  status: 'error';
  message: string;
  code?: string;
  details?: ApiFieldIssue[];
}

/** Builds a { fieldName: message } lookup from the API's details array. */
export function fieldErrorsFrom(details: ApiFieldIssue[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of details ?? []) {
    map[issue.path] = issue.message;
  }
  return map;
}
