export interface ApiErrorBody {
  code: string;
  message: string;
  details: string[];
  traceId: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    headers: { Accept: "application/json" },
  });
  if (response.ok) {
    return (await response.json()) as T;
  }
  throw new ApiError(response.status, await readErrorBody(response));
}

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return {
      code: `HTTP_${response.status}`,
      message: response.statusText,
      details: [],
      traceId: response.headers.get("X-Trace-Id"),
    };
  }
}
