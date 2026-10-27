# 灵基演算

《型月机关》角色卡里的小战棋。在酒馆里从状态栏「模拟训练场」打开，也可以直接用浏览器打开 index.html 单独试玩。

- 规则内核 `core.js`、棋子能力 `cards-impl.js`、棋子与礼装数据 `data.js`、界面 `index.html`、素材 `assets/`。
- 棋子头像、礼装卡面和语音直接从 fgo.wiki 加载。
- 这个仓库的文件由角色卡项目的 `小战棋原型/tools/build-release.mjs` 生成，不要在这里手改。

角色卡通过 jsDelivr 加载：`https://testingcf.jsdelivr.net/gh/TheBestAlice/lingji-chess@main/index.html`。
