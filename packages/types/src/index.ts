export type Id = string;

export type ApiResponse<T> = {
  data: T;
  error?: string;
};
