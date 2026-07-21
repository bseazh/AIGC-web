import Link from "next/link";

export default function NotFound() {
  return <main className="system-page"><h1>页面未找到</h1><p>该页面不存在，或已被移动。</p><Link href="/">返回首页</Link></main>;
}
