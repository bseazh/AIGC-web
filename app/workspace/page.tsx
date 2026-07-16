"use client";

import {
  ArrowLeft,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Download,
  Home,
  ImageIcon,
  Layers3,
  Menu,
  Plus,
  Search,
  Shirt,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const tools = [
  { name: "商品主图", note: "生成电商首屏视觉", icon: ImageIcon, color: "blue" },
  { name: "模特穿搭", note: "服装自然上身展示", icon: Shirt, color: "violet" },
  { name: "场景延展", note: "匹配营销使用场景", icon: WandSparkles, color: "cyan" },
  { name: "详情页套图", note: "组织统一卖点表达", icon: Layers3, color: "orange" },
];

const tasks = [
  { title: "磨砂保温杯 · 通勤场景", type: "商品主图", time: "刚刚", status: "生成中", progress: 68, image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=300&q=80" },
  { title: "轻户外风衣 · 城市街景", type: "模特穿搭", time: "12 分钟前", status: "已完成", progress: 100, image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=300&q=80" },
  { title: "香氛礼盒 · 节日套图", type: "商品主图", time: "昨天 18:24", status: "已完成", progress: 100, image: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=300&q=80" },
];

export default function Workspace() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <main className="workspace-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="workspace-brand"><span><Sparkles size={19} /></span><strong>潮汐创作台</strong></div>
        <nav>
          <a className="active"><Home size={19} />工作台</a>
          <a><Sparkles size={19} />创作工具</a>
          <a><Clock3 size={19} />任务中心<span className="nav-count">1</span></a>
          <a><Boxes size={19} />内容资产</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="credit-card"><span>可用积分</span><strong><Coins size={18} />2,480</strong><button>充值</button></div>
          <Link href="/"><ArrowLeft size={17} />返回首页</Link>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} />}

      <section className="workspace-main">
        <header className="workspace-header">
          <button className="icon-button mobile-menu" aria-label="打开菜单" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <div className="search-box"><Search size={17} /><input placeholder="搜索任务或资产" /></div>
          <div className="header-actions"><button className="icon-button" aria-label="通知"><Bell size={19} /><i /></button><span className="avatar">潮</span></div>
        </header>

        <div className="workspace-content">
          <section className="welcome-row"><div><p>下午好，创作者</p><h1>今天想做什么？</h1></div><button className="new-task"><Plus size={18} />新建任务</button></section>

          <section className="tool-grid" aria-label="创作工具">
            {tools.map((tool) => { const Icon = tool.icon; return (
              <button className="tool-card" key={tool.name}><span className={`tool-icon ${tool.color}`}><Icon size={22} /></span><span><strong>{tool.name}</strong><small>{tool.note}</small></span><ChevronRight size={18} />
              </button>
            ); })}
          </section>

          <section className="workspace-band">
            <div className="section-title"><div><h2>最近任务</h2><p>跟踪生成进度与最新结果</p></div><button>查看全部<ChevronRight size={16} /></button></div>
            <div className="task-list">
              {tasks.map((task) => (
                <article className="task-row" key={task.title}>
                  <img src={task.image} alt="" />
                  <div className="task-copy"><strong>{task.title}</strong><span>{task.type} · {task.time}</span></div>
                  <div className={`task-status ${task.progress === 100 ? "done" : "running"}`}>
                    {task.progress === 100 ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}{task.status}
                  </div>
                  <div className="progress"><i style={{ width: `${task.progress}%` }} /></div>
                  <button className="icon-button" aria-label={task.progress === 100 ? "下载" : "查看"}>{task.progress === 100 ? <Download size={18} /> : <ChevronRight size={18} />}</button>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
