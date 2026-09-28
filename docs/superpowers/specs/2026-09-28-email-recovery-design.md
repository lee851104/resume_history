# Google 信箱復原設計

使用者已同意伺服器協助復原，取代「管理員無法解密」承諾。已登入者可寄送 OTP 至綁定 Google 信箱，驗證後設定新私人密碼並保留資料。

- 保留既有 AES-GCM 資料、密碼及離線復原碼。啟用時經 HTTPS 提交主金鑰，伺服器以 VAULT_RECOVERY_SECRET（32 隨機 bytes 的 hex）封存，AAD 綁定 owner、vault、信箱。
- RLS 保護每人的封存密文。伺服器驗證金鑰能解密目前 vault 才接受啟用；不能上傳私人密碼。伺服器與復原秘密的持有人有解密能力。
- 所有 API 要求登入、X-Vault-Owner；寫入要求同來源 JSON。目的信箱取自已驗證 Google identity，不能由客戶端指定。
- 使用不持久化的 Supabase Auth client 發送／消耗 OTP，驗證結果的 user ID 與信箱必須匹配。臨時 OTP session 不寫入瀏覽器，完成後撤銷其 refresh token。
- 驗證後回傳主金鑰至頁面記憶體，瀏覽器沿用 revision CAS 更新封套；錯碼、過期、重放不能返回金鑰。取消／重整丟棄材料，衝突保留輸入但不得覆蓋新資料。
- 既有 vault 必須先密碼／離線復原碼解鎖一次才能啟用。新 vault 完成建立後提供啟用步驟，失敗可重試或先繼續工作台，清楚顯示未啟用。
- Supabase 新 migration、Email provider、含 {{ .Token }} 的 Magic Link 信件及正式 SMTP 必須配置。未設定 secret／migration 時顯示未就緒。正式服務不得宣稱未驗證的寄信能力。
- 密碼復原不旋轉 master，不撤銷其他已解鎖裝置。備份伺服器秘密；遺失它仍可用私人密碼或離線復原碼解鎖。

驗收：原資料及檔案重設後可讀、帳號隔離、AAD 防串戶竄改、API 身分／來源／錯碼／未啟用／不匹配材料、DB RLS、桌機與手機流程、既有功能回歸。
