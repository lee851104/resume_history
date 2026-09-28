# 履歷投遞追蹤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the recommended inline execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可在手機與電腦使用、Google 登入、只貼職缺連結與選履歷即可記錄的私人投遞儀表板。

**Architecture:** Next.js 提供網頁與受保護 API，Supabase 提供 Google OAuth、Postgres 與私人檔案儲存。資料表與檔案都以使用者所有權限制存取；履歷採不可覆寫版本。優先完成可預覽的主要畫面，再串接持久化功能。

**Tech Stack:** TypeScript、Next.js App Router、React、CSS、Supabase JS／SSR、Zod、Vitest、Playwright；部署目標 Vercel。

**Spec:** `docs/superpowers/specs/2026-09-28-resume-tracker-design.md`

## Global Constraints

- 「只提供有效職缺連結與履歷即可建立紀錄。」
- 「無法讀取的職缺網址仍可正常儲存、開啟與更新狀態。」
- 「初版支援 PDF、DOC、DOCX，單檔上限 20 MB。」實作界線為 20,000,000 bytes。
- 「Google OAuth 為既定登入需求。」
- 「不使用瀏覽器儲存作為主要資料來源。」
- 「手機寬度 375px 與桌面均可新增、更新、下載，沒有橫向溢出。」
- 繁體中文；預設淺色、深藍主要操作色；不加入信箱、自動投遞或推播功能。
- 不覆寫歷史履歷，不公開檔案，不以示範資料或假的登入宣稱完成正式同步。

## 部署決策與外部依賴

已讀的 Sites 驗證指南未確認直接 Google OAuth 的實作路徑，因此本計畫使用標準 Next.js 專案搭配 Supabase 與 Vercel，不建立依賴 ChatGPT 登入的 Sites starter。此選擇落實原設計的 Google 登入要求。

官方依據（2026-09-28 查閱）：
- Google 登入設定：https://supabase.com/docs/guides/auth/social-login/auth-google
- 私人檔案下載：https://supabase.com/docs/guides/storage/serving/downloads
- Next.js 部署：https://vercel.com/docs/frameworks/full-stack/nextjs

正式上線所需：使用者擁有的 Supabase 專案、Google OAuth client、Vercel 專案，以及精確設定的回呼網址。Google client secret 只填於服務設定；不貼進聊天、不提交 Git。Supabase URL 與 publishable key 使用環境設定；不需要把 service-role key 交給瀏覽器。

實作期間先完成程式、遷移 SQL、預覽與測試，再引導使用者處理必須登入本人帳號的設定。不購買服務。未完成外部設定時明確回報尚未上線，不能以本機預覽視為手機可隨時使用的成品。

## Review Focus

1. 同名履歷重新上傳：Task 3 測試新識別碼、新物件路徑，舊檔下載雜湊不變。
2. 不同帳號引用別人的履歷：Task 2、3、4 測試資料表、關聯與 Storage 政策均拒絕。
3. 使用者重按儲存或網路回應遺失：Task 4 測試同一 request_id 只建立一筆。
4. 午夜與時區、已結束紀錄仍有追蹤日期：Task 4 測試當地日期與待追蹤統計。
5. 惡意網址、重新導向與不完整職缺頁：Task 5 測試拒絕內網且原紀錄不受影響。

## 檔案分工

- `app/page.tsx`、`app/layout.tsx`、`app/globals.css`、`app/icon.svg`：主要畫面與全站樣式。
- `components/tracker/{dashboard,application-form,application-list,resume-picker}.tsx`：使用者流程。
- `lib/domain/{types,validation,summary}.ts`：共用模型、驗證與統計。
- `lib/supabase/{browser,server,session}.ts`、`lib/auth.ts`：驗證與資料存取客戶端。
- `app/auth/{login,callback,logout}/route.ts`、`proxy.ts`：登入回呼與工作階段更新；依安裝的 Next.js 官方介面核對 proxy API。
- `app/api/applications/route.ts`、`app/api/applications/[id]/route.ts`：紀錄查詢、新增、編輯。
- `app/api/resumes/route.ts`、`app/api/resumes/[id]/download/route.ts`：履歷元資料、簽名上傳與下載。
- `lib/jobs/{safe-fetch,metadata}.ts`、`app/api/applications/[id]/metadata/route.ts`：安全且可失敗的職缺辨識。
- `supabase/migrations/202609280001_initial.sql`：表格、索引、RLS、私人 bucket 政策。
- `tests/`、`e2e/`：邏輯、安全邊界、跨装置流程。
- `.env.example`、`README.md`：環境參數、初始化、部署及驗證說明。

## Task 1: 可辨識的主要畫面與資料模型

**Interfaces:** `ApplicationStatus = 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn'`。`Application` 包含 id、jobUrl、company/title 可空、platform、appliedOn（YYYY-MM-DD）、status、resumeId、notes/followUpOn 可空、createdAt/updatedAt。`ResumeVersion` 包含 id、originalName、displayName、size、contentType、createdAt。

**Files:** 專案設定、`app/*`、`components/tracker/*`、`lib/domain/*`、`tests/domain.test.ts`。

- [ ] 讀取相關開發技能，檢查現有檔案及 Git 狀態；空白非 Git 專案可原地初始化 Git，保留 docs。鎖定相容穩定依賴版本與 lockfile。
- [ ] 建立最小 Next.js 專案與腳本 `dev`、`build`、`test`、`test:e2e`；記錄執行環境。
- [ ] 加入失敗測試：`parseApplication({jobUrl:'https://example.com/job',resumeId:uuid,appliedOn:'2026-09-28'})` 預設 applied，company/title 可空；javascript URL、無履歷、無效日期被拒絕。執行 `npm test -- tests/domain.test.ts` 確認失敗。
- [ ] 在 `lib/domain/validation.ts` 實作 `parseApplication(input: unknown): NewApplication` 與共用型別，測試通過。
- [ ] 實作深藍操作色、精簡摘要、狀態圖、桌面列表／手機卡片與新增表單；未連接服務時明確顯示設定狀態，不假裝可儲存。
- [ ] 最小主要畫面正常提供 HTTP 回應後開啟預覽；主流程可辨識後才擴充其他功能。執行 `npm run build`，通過後提交此任務檔案。

## Task 2: Google 登入與持久化授權

**Interfaces:** `requireUser(): Promise<{id:string,email?:string}>` 驗證伺服器使用者；`createServerClient()` 使用該使用者 session，所有 API 拒絕匿名；`NewApplication` 沿用 Task 1。

**Files:** `lib/supabase/*`、`lib/auth.ts`、`app/auth/*`、`proxy.ts`、migration、`.env.example`、`tests/auth.test.ts`、`tests/rls.integration.test.ts`。

- [ ] 測試匿名 API 為 401；登入後 returnTo 只允許站內相對路徑；跨來源寫入拒絕。先執行 `npm test -- tests/auth.test.ts` 確認失敗。
- [ ] 實作 Google PKCE OAuth、code exchange、cookie 更新、登出，依目前官方 SSR 文件核对；不自行處理 Google 密碼。
- [ ] 建立 `resume_versions` 與 `applications`：owner_id 對應 auth.users，履歷 `(owner_id,id)` 複合唯一鍵，投遞用複合外鍵確保引用同一擁有者履歷；日期用 date、時間用 timestamptz；狀態 check、request_id 每位使用者唯一。
- [ ] 啟用並建立 SELECT／INSERT／UPDATE／DELETE RLS，履歷物件路徑限定 `{auth.uid()}/{resumeId}/{safeName}`；履歷使用限制刪除的外鍵；bucket 為 private，大小限制 20,000,000 bytes。
- [ ] 執行 auth 測試。可用隔離測試資料庫時執行 `npm test -- tests/rls.integration.test.ts`，驗證匿名及第二帳號不能讀寫、跨擁有者引用失敗。無資料庫時標示未驗證，不把跳過算通過。提交已驗證程式。

## Task 3: 履歷上傳、版本選用與下载

**Interfaces:** `POST /api/resumes` action=prepare 接受 `{fileName,size,contentType}`，回傳 `{resumeId,path,token}`；瀏覽器使用受限簽名上傳直送 Storage，避開網頁服務請求大小限制。action=finalize 接受 `{resumeId}`，伺服器驗證已上傳檔案後回傳 `ResumeVersion`。`GET /api/resumes` 僅列完成版本；`GET /api/resumes/:id/download` 經驗證後導向 60 秒有效下載連結。

**Files:** 履歷 API、`components/tracker/resume-picker.tsx`、`tests/resumes.test.ts`、`tests/resumes.integration.test.ts`。

- [ ] 失敗測試斷言 20,000,000 bytes 可接受、20,000,001 被拒絕；不支援副檔名、空檔、格式偽裝被拒絕；同名上傳產生不同 id/path。執行 `npm test -- tests/resumes.test.ts`。
- [ ] 實作 prepare／finalize；檢查 PDF、DOC、DOCX 檔案簽章／容器格式，限制讀取大小；不以原始檔名作唯一鍵，不允許 upsert 覆寫。失敗不建立可選的正式版本。
- [ ] 履歷選單顯示原名與時間，可改 displayName；下載先查本人元資料才簽名，顯示原始檔名。
- [ ] 執行單元測試與可用的 integration：第二帳號取得下載被拒絕，新版上傳後舊檔 hash 不變；finalize 重試不建立重複版本。提交。

## Task 4: 投遞管理、統計與手機操作

**Interfaces:** `GET /api/applications -> Application[]`；`POST` 接受 `NewApplication & {requestId:string}`，回傳紀錄；`PATCH /api/applications/:id` 允許變更已驗證的表單欄位，禁止改 owner；`summarize(items:Application[],today:string)` 回傳 total、interviewing、due、byStatus。

**Files:** application API、四個 tracker 元件、`lib/domain/summary.ts`、`tests/applications.test.ts`、`tests/summary.test.ts`、`e2e/tracker.spec.ts`。

- [ ] 寫失敗測試：最少欄位可存、requestId 重送同筆、引用別人履歷拒絕；due 只計 followUpOn<=today 且狀態 applied/interviewing；today 使用瀏覽器當地年月日，不用 UTC 截斷。執行 `npm test -- tests/applications.test.ts tests/summary.test.ts`。
- [ ] 實作 API 與 requestId 唯一約束衝突處理；日期、狀態、URL、字串長度由伺服器驗證；寫入檢查來源。
- [ ] 完成新增、修改、狀態直接切換、備註、追蹤日期、搜尋與篩選；保存失敗保留輸入，避免樂觀成功訊息；存檔後重新取得資料與統計。
- [ ] 實作履歷顯示名稱更新；公司與職缺修正均選填。紀錄預設日期降序，空白時不填假資料。
- [ ] 執行測試與 `npm run test:e2e -- e2e/tracker.spec.ts`：375px 和桌面新增／修改／搜尋、鍵盤與触控操作、200% 放大無遮擋、錯誤保留表單。外部後端未可用時僅將 mock 測試標示為 UI 驗證。提交。

## Task 5: 非阻擋職缺資訊辨識

**Interfaces:** `readJobMetadata(url:string): Promise<{company:string|null,title:string|null,platform:string}>`；`POST /api/applications/:id/metadata` 只處理使用者已儲存的紀錄，失敗保持原資料，手動編輯過的欄位不覆蓋。

**Files:** `lib/jobs/*`、metadata API、`tests/metadata.test.ts`。

- [ ] 寫失敗測試：連線逾時、登入頁、空 HTML 回傳 null；JobPosting JSON-LD 讀取 title/hiringOrganization.name；私有 IPv4/IPv6、localhost、雲端 metadata 位址及重新導向到內網皆不發請求；超大回應停止。執行 `npm test -- tests/metadata.test.ts`。
- [ ] 實作 DNS 解析及連線位址綁定以避免 DNS rebinding；逐跳檢查最多 3 次導向、僅 80/443、總逾時 4 秒、解壓後上限 1 MB。優先結構化 JobPosting，不以頁面 title 猜公司；移除 HTML，不執行 script。
- [ ] 以網址網域識別平台；存檔成功後客戶端另發 metadata 請求，讀取失敗不改成儲存失敗、不要求补填；讀取中仍可操作紀錄。
- [ ] 執行 metadata 測試及全套 `npm test`，確認既有紀錄的網址與履歷不受辨識失敗影響。提交。

## Task 6: 雲端設定、完整驗收與交付

**Files:** `README.md`、`.env.example`、`e2e/cloud.spec.ts`；必要的部署設定。

- [ ] 完成單一設定清單：Supabase URL/publishable key、migration、private bucket、Google provider、Google 精確回呼 URI、Supabase Site URL 及允許回呼、Vercel 環境參數；從實際專案取得網址，不編造 ID 或密鑰。
- [ ] 使用者本人登入或授權需要時才請其操作；不發佈真實履歷、不購買方案。保留已完成的可審閱程式，不因外部帳號等待停做其他工作。
- [ ] 執行 `npm test`、`npm run build`；串接後執行 RLS 與檔案 integration、`npm run test:e2e -- e2e/cloud.spec.ts`。驗證 Google 真實登入、同帳號兩個工作階段同步、另一帳號隔離、20 MB 上傳與原檔下載。
- [ ] 執行完成驗證及程式審查技能，修正阻擋性問題後部署。確認部署成功、正式網址可訪問、OAuth 回呼成功、手機流程可用。
- [ ] 交付可使用網址、最簡短操作說明、未驗證項目（若有）。缺少帳號設定時明確說明尚未上線及需要的具體動作，不把本機預覽當完成。

## 執行方式建議與計畫自查

建議由目前助理在本對話依序實作，因登入、資料授權與履歷關聯共用介面，依序完成較容易維持一致。使用者確認本計畫與執行方式後再開始產品程式。

自查：設計稿各項已對應 Task 1–6；Google 與雲端設定單獨列為外部驗收依賴；版本不可覆寫、跨帳號授權、逾時回退與跨裝置流程均有驗證步驟。尚無程式、測試或部署完成的宣稱。
