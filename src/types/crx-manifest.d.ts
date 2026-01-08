import type { ManifestV3Export } from '@crxjs/vite-plugin';

// 通过声明合并，为 ManifestV3Export 类型扩展缺失的属性
declare module '@crxjs/vite-plugin' {
  interface ManifestV3Export {
    cross_origin_embedder_policy?: {
      value: 'require-corp' | 'unsafe-none';
    };
    cross_origin_opener_policy?: {
      value: 'same-origin' | 'same-origin-allow-popups';
    };
    host_permissions?: string[];
    web_accessible_resources?: {
      matches: string[];
      resources: string[];
      use_dynamic_url?: boolean;
    }[];
  }
}
