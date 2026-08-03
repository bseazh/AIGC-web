type ErrorPageProps = {
  statusCode?: number;
};

export default function ErrorPage({ statusCode }: ErrorPageProps) {
  return (
    <main className="system-page">
      <h1>{statusCode === 404 ? "页面未找到" : "页面暂时不可用"}</h1>
      <p>{statusCode ? `错误码 ${statusCode}` : "请刷新页面后重试。"}</p>
      <a href="/">返回首页</a>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: { res?: { statusCode?: number }; err?: { statusCode?: number } }) => ({
  statusCode: res?.statusCode || err?.statusCode || 500,
});
