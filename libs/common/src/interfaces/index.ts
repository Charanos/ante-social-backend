export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface JwtPayload {
  sub: string;        // userId
  email: string;
  username: string;
  role: string;
  tier: string;
  iat?: number;
  exp?: number;
}

export interface CurrentUserData {
  id?: string;
  _id?: string;
  userId: string;
  email: string;
  username: string;
  role: string;
  tier: string;
}
