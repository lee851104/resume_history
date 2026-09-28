# Vercel 正式部署

- 帳號／Team：lee851104s-projects（Hobby）
- 專案：resume-history
- 正式網址：https://resume-history.vercel.app
- GitHub：https://github.com/lee851104/resume_history
- 正式分支：main；框架 Next.js，Node.js 24.x，建置使用 npm run build。

## 已配置的 Production 變數

NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY、APP_ORIGIN=https://resume-history.vercel.app、VAULT_RECOVERY_SECRET、VAULT_EMAIL_RECOVERY_ENABLED=true。

復原秘密透過 stdin 提交到 Vercel Secret，沒有放入命令參數、Git 或聊天。必須保留同一值，避免讓已啟用的復原封存失效。`.env.local` 僅供本機；`.vercelignore` 另外排除本機秘密與測試產物。

## Supabase 正式登入回呼

Authentication → URL Configuration：

- Site URL：https://resume-history.vercel.app
- Redirect URLs：https://resume-history.vercel.app/auth/callback
- 本機 http://127.0.0.1:3000/auth/callback 可以保留供開發使用。

Google Cloud 的 Authorized redirect URI 仍是 Supabase 專案 callback：https://lwdzodbnbmxnzsbyturq.supabase.co/auth/v1/callback 。不要改成 Vercel 網址。

## 開放其他 Google 帳號

Google Auth Platform → 目標對象（Audience）確認使用者類型是 External，若 Publishing status 仍為 Testing，需發布為 In production，否則非測試名單的人可能無法登入。每人首次登入建立自己的保險箱；RLS 與 owner 綁定隔離資料，啟用信箱復原者採伺服器保管復原金鑰。

## 驗收

外部訪客能開啟首頁；/api/session 顯示已配置而未登入；私人 API 拒絕匿名；Google OAuth 的 redirect_to 是正式 callback；Supabase 允許正式 callback。另需真實 Google 帳號登入、第二帳號隔離、手機同步、履歷下載及驗證碼收信測試。

Preview deployments 尚未配置資料庫環境變數，不能當正式服務使用。正式設定與資料庫不跟著 Preview 自動複製。

官方：[Vercel CLI 部署](https://vercel.com/docs/projects/deploy-from-cli)、[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)。
