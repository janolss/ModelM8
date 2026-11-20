export class TwoC8ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, method: string, path: string) {
    super(`2c8 API ${method} ${path} failed with ${status}: ${body}`);
    this.name = "TwoC8ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export class TwoC8Client {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    let path = options.path;
    for (const [key, value] of Object.entries(options.pathParams ?? {})) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-api-key": this.apiKey,
    };
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      if (value) {
        headers[key] = value;
      }
    }

    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);
    const text = await response.text();
    if (!response.ok) {
      throw new TwoC8ApiError(
        response.status,
        text || response.statusText,
        method,
        path,
      );
    }

    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}
