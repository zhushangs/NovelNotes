# 读后记 NovelNotes

记录读过的小说：书名 → 作者 → 主角（1–2 个）→ 随手写感想。
写的内容会自动保存到 Supabase，手机和电脑登录同一个账号就能接着写。
写完可以一键排版成带 @ID 水印的图片（3:4 分页 或 长图，三种配色）。

纯静态网页（HTML + CSS + JS），不需要构建，不需要服务器。

```
index.html            页面
css/style.css         样式（自动适配深色模式）
js/config.js          ← 填 Supabase 地址和 key
js/store.js           数据层（Supabase / 本地模式）
js/render.js          图片排版（Canvas）
js/app.js             页面逻辑、自动保存、多设备同步
supabase/schema.sql   建表脚本
setup/keepalive.yml   防止 Supabase 免费项目被暂停（需挪到 .github/workflows/）
```

---

## 一、先在本机试用（可选）

`js/config.js` 留空时是「本地模式」，数据只存在当前浏览器，适合先看看效果：

```powershell
cd D:\NovelNotes
python -m http.server 8080
```

浏览器打开 http://localhost:8080 。（直接双击 index.html 也能用。）

## 二、创建 Supabase 项目（约 5 分钟）

1. 打开 https://supabase.com 注册并 **New project**，Region 选离你近的（如 `East US`），数据库密码随便设一个记下来。
2. 左侧 **SQL Editor** → **New query**，把 `supabase/schema.sql` 全部粘进去 → **Run**。
3. 左侧 **Project Settings → API**（新版界面叫 **API Keys**），复制：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **anon public** key（新版叫 **Publishable key**，`sb_publishable_...`）
4. 填进 `js/config.js`：
   ```js
   window.NOVELNOTES_CONFIG = {
     SUPABASE_URL: 'https://xxxx.supabase.co',
     SUPABASE_ANON_KEY: '你的 anon / publishable key',
   };
   ```
   这个 key 本来就是公开给前端用的，数据由行级安全（RLS）保护，每个账号只能看到自己的笔记。
   **不要**填 `service_role` / `secret` key。

5. **Authentication → Providers → Email**：
   - 想省事可以关掉 **Confirm email**，注册后直接能登录；
   - 保留的话，注册后要去邮箱点确认链接。这时请在 **Authentication → URL Configuration** 把 **Site URL** 改成你部署后的网址（见下一步），否则确认链接会跳到 localhost。

6. 自己注册完账号后，建议在 **Authentication → Providers → Email**（或 Sign In / Up 设置）里关闭 **Allow new users to sign up**，这样别人拿到网址也注册不了。

## 三、部署到 GitHub Pages（手机才能访问）

D:\NovelNotes 已经是 git 仓库：

```powershell
cd D:\NovelNotes
git add .
git commit -m "读后记 NovelNotes"
# 在 GitHub 新建一个空仓库（Public；私有仓库用 Pages 需要付费账号），然后：
git remote add origin https://github.com/<你的用户名>/NovelNotes.git
git branch -M main
git push -u origin main
```

GitHub 仓库 → **Settings → Pages** → Source 选 **Deploy from a branch**，Branch 选 `main` / `(root)` → Save。
一两分钟后网址是 `https://<你的用户名>.github.io/NovelNotes/`。

> 仓库是公开的，但里面只有代码和 anon key，没有你的笔记内容；笔记都在 Supabase 里，受登录保护。

**手机上**：用 Safari / Chrome 打开这个网址 → 分享 →「添加到主屏幕」，之后用起来就像一个 App。

## 四、防止 Supabase 免费项目被暂停

免费项目一周没有数据库活动会被自动暂停（数据不会丢，可在后台恢复）。
`setup/keepalive.yml` 是一个 GitHub Actions 定时任务，每两天自动访问一次数据库来避免这种情况。

先把它挪到 GitHub 能识别的位置，再推送：

```powershell
cd D:\NovelNotes
mkdir .github\workflows
move setup\keepalive.yml .github\workflows\keepalive.yml
git add .
git commit -m "keep-alive"
git push
```

然后在 GitHub 仓库：

**Settings → Secrets and variables → Actions → New repository secret**，添加两个：

| Name | Value |
|---|---|
| `SUPABASE_URL` | 和 config.js 里相同 |
| `SUPABASE_ANON_KEY` | 和 config.js 里相同 |

然后在 **Actions** 标签页里手动 Run 一次 *Supabase keep-alive*，看到绿色对勾就好了。
（GitHub 会在仓库 60 天没有任何提交时停掉定时任务，届时会发邮件提醒，点一下重新启用即可。）

---

## 使用说明

- **写新笔记**：首页依次回答书名、作者、主角，然后进入写感想的页面。按回车可以直接到下一步。
- **自动保存**：停止输入约 1 秒后自动保存，状态显示在左下角（绿点 = 已同步）。
- **多设备接着写**：在手机上写一半，到电脑上打开同一篇笔记就是最新内容。页面开着时每 20 秒、以及切回这个页面时都会自动拉取另一台设备的更新。
- **冲突**：如果两台设备同时改了同一篇，会弹窗让你选：两份都留（把这台设备写的接在云端内容后面）、用云端版本、或用这台设备的版本覆盖。不会悄悄丢内容。
- **生成图片**：笔记页点「生成图片」。可切换 3:4 竖版（内容多时自动分页，标注 1/3、2/3…）或长图，配色有宣纸 / 夜墨 / 青瓷。电脑上点下载；手机上点「分享 / 存到相册」或长按图片保存。
- **水印**：在「设置」里填水印 ID，会以 `@ID` 斜向平铺在图片上，底部还有一个 ID 印章落款。设置会同步到所有设备。

## 以后想改什么

- 图片版式都在 `js/render.js`：字号 `BODY_SIZE`、行高 `BODY_LH`、配色 `THEMES`、水印密度 `drawWatermark`。
- 想加字段（比如评分、标签、阅读日期）：`schema.sql` 加列 → `store.js` 的 `cleanPatch` / `NOTE_FIELDS` → `app.js` 的编辑页。
