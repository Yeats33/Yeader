export type AppRuntimeSnapshot = {
  mode: "mock";
  note: string;
};

export type ImportChannel = {
  id: string;
  name: string;
  description: string;
};

export type BookshelfItem = {
  title: string;
  author: string;
  progressLabel: string;
};

export type ApiCapability = {
  id: string;
  label: string;
  status: "reserved";
};

export type AppShellSnapshot = {
  runtime: AppRuntimeSnapshot;
  importChannels: ImportChannel[];
  bookshelf: BookshelfItem[];
  apiCapabilities: ApiCapability[];
};

const appShellSnapshot: AppShellSnapshot = {
  runtime: {
    mode: "mock",
    note: "后端接口已预留，当前展示的是工作台骨架。",
  },
  importChannels: [
    {
      id: "book-sources",
      name: "书源管理",
      description: "导入与维护 legado 书源，兼容后续 Rust 规则执行引擎。",
    },
    {
      id: "rss-feeds",
      name: "RSS 聚合",
      description: "统一管理订阅源并为桌面端与移动端同步保留接口。",
    },
    {
      id: "cloud-backups",
      name: "备份恢复",
      description: "支持 legado 备份文件导入，为迁移与恢复流程预留入口。",
    },
  ],
  bookshelf: [
    {
      title: "三体",
      author: "刘慈欣",
      progressLabel: "阅读至第 18 章",
    },
    {
      title: "雪中悍刀行",
      author: "烽火戏诸侯",
      progressLabel: "阅读至第 102 章",
    },
    {
      title: "置身事内",
      author: "兰小欢",
      progressLabel: "加入书架，待开始",
    },
  ],
  apiCapabilities: [
    {
      id: "library-sync",
      label: "书架同步",
      status: "reserved",
    },
    {
      id: "search-aggregation",
      label: "搜索聚合",
      status: "reserved",
    },
    {
      id: "reader-session",
      label: "阅读会话",
      status: "reserved",
    },
  ],
};

export type AppApi = {
  getAppShellSnapshot(): Promise<AppShellSnapshot>;
};

export function createAppApi(): AppApi {
  return {
    async getAppShellSnapshot() {
      return appShellSnapshot;
    },
  };
}
