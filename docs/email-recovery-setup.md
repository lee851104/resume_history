# Google 信箱復原設定

此功能用信箱 OTP 找回保險箱主金鑰，**不是重設 Google 密碼或 Supabase 的登入密碼**。啟用後，擁有伺服器復原秘密及資料庫權限的人具備解密能力。每個帳號仍受 RLS 隔離。

## 既有 Supabase 專案

1. 在 SQL Editor 執行 `supabase/migrations/202609280003_email_recovery.sql` 一次。前兩份已執行者不要重跑。
2. Authentication → Sign In / Providers → Email 保持啟用，Email OTP expiration 建議設為 **600 秒**（10 分鐘）。Google Provider 也必須保留。
3. Authentication → Email Templates → Magic Link，把信件內容改為 `docs/email-recovery-template.html`。關鍵是 `{{ .Token }}`，不要只放登入連結。可用主旨「投遞日誌：信箱驗證碼」。
4. 設定 Authentication → Email / SMTP Settings 的自訂 SMTP。正式開放其他使用者前必須完成。Supabase 預設寄信服務只允許專案團隊授權的信箱、預設每小時 2 封，不能作為公開服務的寄信方案。寄件網域需依供應商驗證；SMTP 密碼只填 Supabase，不放聊天或 Git。
5. 設定以下伺服器環境變數，然後重啟本機開發服務或重新部署：

```dotenv
VAULT_RECOVERY_SECRET=<32 個隨機 bytes 的 hex，總共 64 個字元>
VAULT_EMAIL_RECOVERY_ENABLED=true
```

本次已在忽略 Git 的 `.env.local` 產生秘密，沒有輸出到聊天。Vercel 請使用同一份秘密，且另外存入密碼管理器。不要加 `NEXT_PUBLIC_` 前綴，不要用 Supabase publishable key 代替，也不要每次部署換新。將 secret 與資料庫密文分開保管。可用 Node 的 `crypto.randomBytes(32).toString('hex')` 產生新環境的秘密，但不得覆盖已有封存使用中的秘密。

寄信、migration 尚未配置前，保持 `VAULT_EMAIL_RECOVERY_ENABLED=false`，介面會顯示尚未設定。

## 使用者流程

- 舊帳號先用私人密碼或離線復原碼解鎖一次，按「啟用信箱復原並繼續」。新帳號建立保險箱後也會看到同一步驟。略過代表尚未啟用，下次解鎖可再啟用。
- 忘記密碼時，先登入原 Google 帳號，再選「忘記密碼？使用 Google 信箱驗證」。收件者固定為已驗證的綁定 Google 信箱，不能輸入別人的信箱。
- 輸入信箱 OTP、設定新私人密碼、確認保存。已啟用信箱復原時，新的離線復原碼可選擇另存，作為備援。舊密碼對目前封套失效，履歷與紀錄不變。
- 驗證碼是單次使用，錯誤／過期需重寄。驗證成功後若重新整理或離開頁面，需重新驗證。頁面不把復原金鑰放入網址或瀏覽器持久儲存。
- 信箱變更後，需以對應 Google identity 重新登入並解鎖後啟用備份；不會把舊備份寄給不同地址。

## 故障與安全界線

- 尚未啟用又遺失所有本地解鎖方式，不能從既有密文補建復原能力。
- 遺失／換掉伺服器秘密會使舊信箱備份失效；使用者仍可用私人密碼或離線復原碼解鎖並重新啟用。真正換密鑰應先規劃全體封存遷移，本版沒有自動輪替。
- 重設私人密碼不旋轉資料主金鑰，不撤銷其他已解鎖裝置或舊封套備份。不是處理已洩露金鑰的撤銷功能。
- 封存資料表允許本人存取密文；直接改寫無效密文最多會使自己的復原備份失效，不能解密。伺服器使用 AES-GCM 綁定帳號、vault、信箱驗證完整性。
- Supabase 管理 OTP 的期限、一次性消耗及寄送／驗證頻率；多使用者正式流量應檢查 Supabase Auth rate limits。信箱 OTP 會建立一個短暫 Auth session，本站不寫入瀏覽器並撤銷其 refresh token，不影響原 Google session。
- 必須實測寄送、錯碼、過期、重放、密碼重設、另一帳號、跨裝置與履歷下載。自動測試模擬 Auth 與 SMTP，無法證明實際可收信。

官方來源：[Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[自訂 SMTP](https://supabase.com/docs/guides/auth/auth-smtp)。
