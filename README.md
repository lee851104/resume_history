# 投遞日誌

私人履歷投遞追蹤網站。貼職缺連結、選擇履歷即可儲存。支援手機、桌面、Google 登入、履歷版本下載、手動進度和追蹤日期。紀錄與履歷在瀏覽器加密後才上傳，登入後還需要私人解鎖密碼。

## 目前狀態

Vercel 專案 `resume-history` 已連結本儲存庫，正式網址為 https://resume-history.vercel.app 。main 分支推送會觸發部署。Supabase 三份 migration 已建立、Google Provider 已啟用，使用者已完成 SMTP 與 OTP 模板設定；本機及 Vercel Production 已配置信箱復原環境變數。正式網址的登入回呼、Google 對外發布、實際收信與跨裝置操作仍需實際驗收。部署與啟用步驟見 [Vercel 部署說明](docs/vercel-deployment.md) 及 [信箱復原指南](docs/email-recovery-setup.md)。

## 標題與 Excel 匯出

新增或編輯投遞時，可在職缺連結下方填寫選填的「職缺標題」；列表標題連到原職缺網址。

登入並解鎖後，投遞總覽的「匯出全部 Excel」會下載全部投遞紀錄，不受搜尋與進度篩選影響。檔案包含日期、標題、公司、網址、平台、進度、履歷版本／檔名、追蹤日期、備註及建立／更新時間，可上傳至 Google Sheets。匯出在瀏覽器完成，不包含履歷檔案本體。

## 開發

需要 Node.js 22.12 以上。

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

瀏覽 http://127.0.0.1:3000 。APP_ORIGIN 必須與使用的網址一致，本機建議設為 http://127.0.0.1:3000 。

## 1. 建立 Supabase

1. 到 https://supabase.com/dashboard 使用你的帳號建立專案，記下資料庫密碼，勿貼到聊天或提交 Git。
2. 在 SQL Editor 依序執行 `supabase/migrations/202609280001_initial.sql`、`supabase/migrations/202609280002_e2ee.sql` 全部內容各一次。第二份建立加密保險箱與私人 sealed-resumes bucket，並撤除舊明文表格及檔案的使用權限。兩份都成功後才開放網站。信箱復原另需執行 `202609280003_email_recovery.sql`；已執行前兩份的專案只需追加第三份。若偵測到舊明文紀錄或檔案，第二份會中止；請先另外規劃匯出與遷移，不能跳過檢查或直接刪除舊資料。
3. 從專案 Connect 視窗取得 Project URL 與 publishable key，填入 .env.local：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://你的專案.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=你的publishable-key
APP_ORIGIN=http://127.0.0.1:3000
```

publishable key 是設計給前端使用的公開識別值；資料安全由 RLS 與已驗證登入控制。不要使用 service_role 或 secret key 取代它。

## 2. 設定 Google 登入

1. 在 Supabase Authentication → Sign In / Providers → Google 取得精確的 Callback URL。
2. 在 Google Cloud Console 建立 OAuth consent screen 與 Web application OAuth client，加入你的帳號為測試使用者（若目前是 Testing）。授權重新導向 URI 填上一步的 Supabase Callback URL，切勿填網站 /auth/callback 作為 Google 的 URI。
3. 將 Google Client ID、Client secret 填到 Supabase Google provider 設定並啟用；Client secret 只放 Supabase，不放程式或聊天。
4. Supabase Authentication → URL Configuration 的 Site URL 填正式 Vercel 網址；Redirect URLs 加入正式網址的 /auth/callback，本機測試再加入 http://127.0.0.1:3000/auth/callback 。不要使用無限制萬用字元。
5. 重新啟動開發伺服器後使用 Google 登入。

官方說明：https://supabase.com/docs/guides/auth/social-login/auth-google

## 3. 部署到你已有的 Vercel

1. 將這個專案存到自己的 GitHub 私人 repository（不包含 .env.local），在 Vercel 匯入，Framework 選 Next.js。
2. Vercel Environment Variables 加入上面的兩個 NEXT_PUBLIC 值，以及 APP_ORIGIN=你的正式 https 網址。APP_ORIGIN 不含結尾斜線。啟用信箱復原另加 VAULT_RECOVERY_SECRET 與 VAULT_EMAIL_RECOVERY_ENABLED=true，依設定指南操作，不能每次部署重新產生秘密。
3. Deploy。若是在首次部署後才取得固定網址，更新 APP_ORIGIN 與 Supabase Redirect URLs，重新部署。
4. 若建立 Preview deployment，也必須有相符 APP_ORIGIN 和精確回呼網址；不要把 production 的登入回呼誤用到 preview。
5. 用 Google 登入正式網址，設定私人解鎖密碼並另存復原碼；手機登入同一 Google 帳號、輸入同一私人密碼後，確認兩邊紀錄相同。正式環境需 HTTPS 才能使用瀏覽器加密。

部署指南：https://vercel.com/docs/frameworks/full-stack/nextjs

## 使用

- 「新增投遞」貼網址，選已有履歷或上傳 PDF / DOC / DOCX（最多 20,000,000 bytes）。
- 日期預設今天；公司、職缺、備註和追蹤日期選填。
- 在列表直接改狀態；「我的履歷」可重新命名顯示名稱及下載。
- 新履歷建立獨立版本，不能覆寫已保存檔案。下載時取回密文並在裝置還原原始檔案；雲端密文連結 60 秒有效。
- 切回網頁會重新載入雲端紀錄；也可按右上角重新整理。
- 平台依網址在本機辨識；公司與職缺名稱選填。網址不會送給伺服器抓取資訊。
- 可手動鎖定；重新整理、離開頁面或閒置 15 分鐘後需重新解鎖。先解鎖並啟用 Google 信箱復原後，忘記密碼可收取驗證碼重設；離線復原碼保留為備援。未啟用者必須使用原密碼或離線復原碼。

## AI 職缺待辦匯入

在「職缺待辦」→「匯入職缺」複製給 AI 的整理指令；AI 回傳 JSON 後貼上、預覽及勾選匯入。只必填 jobUrl，公司、職稱與備註選填。待辦可設為待評估、準備投遞、暫緩或不考慮，真正投遞後再選擇履歷與日期，轉成已投遞紀錄。

[完整格式與使用說明](docs/ai-job-import.md)。待辦沿用瀏覽器加密，不需要新的資料庫 migration。

## 驗證

```powershell
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

SQL 測試使用 PGlite 與模擬 Supabase auth/storage schema 驗證 PostgreSQL RLS、外鍵、trigger 與舊資料遷移保護。加密測試使用真實 Web Crypto，涵蓋錯誤密碼、復原、竄改、帳號與檔案綁定、20 MB 檔案、上傳重試及原檔下載。瀏覽器以模擬登入及密文 API 驗證桌面與手機的建立、解鎖、鎖定、重設密碼、更新進度與失敗保留輸入；不是實際雲端整合驗證。

正式部署後必須另驗證：Google 真實登入、另一帳號隔離、同帳號跨裝置同步、PDF/DOC/DOCX 原檔下載、20 MB 上傳、新版本不改變舊檔、失敗重試。

## 檔案

- app：網頁、登入與 API。
- components/tracker：儀表板、表單、列表與履歷選擇。
- lib/crypto、lib/vault：瀏覽器加密、密文協定、解密資料驗證及同步。
- supabase/migrations：資料庫和 Storage 權限。
- tests、e2e：核心與瀏覽器驗證。

尚未實作自動投遞、信箱職缺自動匯入或推播提醒；追蹤清單需自行查看。

## 加密範圍與限制

- 公司、職缺、網址、平台、投遞日期、進度、備註、追蹤日期、履歷名稱及內容全部加密。伺服器仍可見 Google 帳號、隨機物件 ID、密文大小、檔案數量、更新與存取時間。
- AES-256-GCM 使用隨機 96-bit IV，驗證帳號、保險箱及用途／檔案 ID；PBKDF2-HMAC-SHA256 600,000 次迭代衍生密碼包裝金鑰。復原碼含 256-bit 隨機資料，另行包裝同一主金鑰。
- 私人密碼與離線復原碼不傳給伺服器。啟用信箱復原時，主金鑰透過 HTTPS 交由伺服器以獨立秘密加密封存；OTP 驗證後才經復原 API 送回瀏覽器。解密資料與金鑰不存 localStorage / sessionStorage。下載到裝置的履歷原檔與復原碼由使用者自行保管。JavaScript 記憶體無法保證立即抹除；鎖定會丟棄金鑰與介面資料的引用。
- 已啟用信箱復原且伺服器備份有效時，可登入原 Google 帳號並驗證信箱以重設密碼。未啟用者若密碼和復原碼都遺失，無法補建解密備份。長且獨特的密碼可降低取得密文後的離線猜測風險。
- 資料庫與 Storage 儲存密文；啟用信箱復原後，掌握伺服器復原秘密及資料庫的管理員具備解密能力，不再承諾管理員無法讀取；控制網站程式的人仍可能惡意修改 JavaScript 竊取下次解鎖輸入。這不是對惡意網站程式或受控制裝置的絕對保證。
- 重設密碼不重新加密全部檔案，也不撤銷已解鎖裝置；持有舊金鑰封套備份及舊密碼／復原碼的人仍可能解密。這是遺忘密碼的復原功能，不是金鑰洩漏後的全面撤銷。
- 雲端仍能刪除、拒絕服務或回放舊密文；本版未提供防回滾或使用者完整匯出備份。多裝置同時寫入以 revision 比對拒絕衝突，保留表單輸入供重試。
- 本機測試通過不等於正式安全稽核；實際上線前仍需完成前述真實服務驗證。
