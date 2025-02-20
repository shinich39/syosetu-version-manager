import { Provider } from "node-syosetu-downloader";

export interface Syosetu {
  url: string;
  provider: Provider;
  id: string;
  metas: SyosetuMeta[];
  metaIndex: number;
  files: SyosetuFile[];
  createdAt: number;
  updatedAt: number;
  completedAt: number;
  removedAt: number;
  syncedAt: number;
}

export interface SyosetuFile {
  id: string;
  updatedAt: number;
  removedAt: number;
  path: string;
}

export interface SyosetuMeta {
  id: string;
  title: string;
  updatedAt: number;
  path: string;
}
