import Link from "next/link";
import { notFound } from "next/navigation";

const info = "深圳熵帧影视科技有限公司，注册地址：深圳市福田区沙头街道天安社区泰然四路113号泰然科技园210栋七层7G81B。投诉邮箱：ba_aigc@163.com。";
const docs: Record<string, { title: string; sections: Array<[string, string]> }> = {
  terms: { title: "用户服务协议", sections: [["服务主体", `芭乐AIGC 由${info}`], ["账号与使用", "用户应提供真实注册信息并妥善保管账号，不得利用服务制作、上传或传播违法、侵权、欺诈或损害他人权益的内容。"], ["素材与结果", "用户确认对上传素材和提示词拥有合法授权。生成结果具有概率性，用户应在商业发布前自行核验其准确性、合规性和权利状态。"]] },
  privacy: { title: "隐私政策", sections: [["收集的信息", "我们处理邮箱、密码哈希、昵称、登录 IP、User-Agent、上传素材、提示词、任务结果、积分流水及订单状态信息。密码仅以不可逆哈希形式保存。"], ["使用与保存", "信息用于认证、任务执行、资产管理、积分结算、安全审计和客户支持。输入素材默认保留 30 天，生成结果默认保留 90 天，用户可提前删除。"], ["您的权利", "用户可查询、更正或删除资产；有关隐私请求请联系 ba_aigc@163.com。"]] },
  "aigc-service": { title: "AIGC 服务说明", sections: [["服务内容", "平台提供商品主图、场景图、详情页、图像增强和视频创作等辅助生成能力。不同工作流可能使用不同模型服务。"], ["用户责任", "禁止生成违法、侵权、欺诈、仇恨、暴力或其他违反平台规则的内容。"]] },
  "content-labeling": { title: "AI 内容标识说明", sections: [["标识原则", "平台生成或辅助生成的图片、视频属于人工智能生成内容。用户对外发布时应遵守适用规则，在适当位置标注“AI 生成”或“AI 辅助生成”。"]] },
  complaints: { title: "投诉与侵权处理规则", sections: [["提交方式", "请发送邮件至 ba_aigc@163.com，并提供账号、任务或资产编号、问题描述、权利证明及联系方式。"], ["处理流程", "我们会进行初步核验，必要时要求补充材料或采取限制访问措施，并通常在 15 个工作日内答复。"]] },
  "minor-protection": { title: "未成年人保护说明", sections: [["监护人同意", "未满 14 周岁的未成年人应在监护人同意和指导下使用本服务。平台禁止利用服务制作、传播侵害未成年人权益的内容。"]] },
  "third-party-processors": { title: "第三方处理方说明", sections: [["腾讯云", "腾讯云 COS 用于素材、生成结果和备份存储；腾讯云服务器用于网站、Worker、数据库与 Redis 运行。"], ["生成服务", "火山方舟 / Seedance 用于部分图像或视频生成；SophNet 用于部分图像生成。仅传递完成任务所需的素材、提示词和参数。"]] },
};

export function LegalPage({ slug }: { slug: string }) {
  const doc = docs[slug];
  if (!doc) notFound();
  return <main className="legal-shell"><header><Link href="/">芭乐AIGC</Link><nav><Link href="/terms">服务协议</Link><Link href="/privacy">隐私政策</Link><Link href="/complaints">投诉处理</Link></nav></header><article><p className="legal-kicker">深圳熵帧影视科技有限公司</p><h1>{doc.title}</h1><p className="legal-updated">最近更新：2026 年 7 月 24 日</p>{doc.sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}</article><footer>粤ICP备2025406715号 · ba_aigc@163.com</footer></main>;
}
