import type { Role } from './role';

export interface User {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: { role: Role }[];
}
