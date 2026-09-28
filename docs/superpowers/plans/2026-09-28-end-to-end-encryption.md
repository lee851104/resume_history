# 端對端加密實作計畫
依據：docs/superpowers/specs/2026-09-28-end-to-end-encryption.md。延續使用者已選的本對話直接實作方式，落實已同意的解鎖與復原流程。
1. lib/crypto：封套、PBKDF2、AES-GCM、復原、JSON 與二進位加密；先測試再實作。
2. supabase 002 遷移：獨立密文表與 bucket，明文資料 guard、RLS、不可覆寫與 revision。app/api/vault 和 sealed-files 僅驗證密文結構。舊 API 改為拒絕。
3. lib/vault/client：取回、解密、驗證、修改及 CAS 儲存；履歷先加密、私有下載後解密；不將密碼或資料寫入 browser storage。
4. components/vault：首次設定、復原碼確認、解鎖、復原重設；Google 身分和解密獨立。手動鎖定、閒置15分鐘鎖定。
5. 接上既有 Dashboard；全部修改改儲存密文；移除服務端 metadata 請求；保留連結回退。
6. 更新 SQL / API / browser 測試與 README。獨立程式審查、修正、完整測試與 build；保留真實雲端尚未設定的限制。
