// =========================================================
// 連番作成ツール for Adobe Illustrator
// - 新規に連番テキストを生成(横/縦/グリッド配置)
// - 既に配置済みのテキストオブジェクトに連番を一括割り当て
// 
// 連番作成内容を設定するダイアログを表示します。
// 任意の開始番号と終了番号を指定できます
// 1毎,2毎...10毎 など、インターバル値を設定できます
// 番号には接頭辞と接尾辞を設定できます
// 新しく番号のテキストオブジェクトを作成するか、既存のテキストオブジェクトを書き換えるか選択できます
// =========================================================


// プリプロセッサディレクティブ
// ExtendScript(Illustrator)実行環境向けの指定
#target illustrator
#targetengine "sequenceNumberTool" // 指定名称でセッションを保持＆他のスクリプト(の実行)との干渉を防ぎます


/**
 * zeroPad
 * 数値を指定の桁数になるように "先頭ゼロ埋め文字列" に変換します
 *
 * @param {number} num 
 * @param {number} len 
 * @returns {string}
 * 
 * 引数 num を 引数 len に指定された桁になるように先頭に"0"を付け足します。
 * 戻り値は文字列になります。
 */
function zeroPad(num, len) {
    // numがマイナス値か否か  boolean
    var neg = num < 0;
    // numを絶対値にして文字列化します
    var s = String(Math.abs(num));
    // s.length = 引数numの桁数
    while (s.length < len) s = "0" + s;// 指定の桁数=len になるまで先頭に"0"を付与します
    // numが元々マイナス値だった場合、先頭に"-"を付与して返します
    return (neg ? "-" : "") + s;
}


// -----------------------------------------------------


/**
 * main
 * スクリプトのエントリーポイント
 * ダイアログ(UI)の構築と、実行ボタンが押されたときの処理振り分けを行います。
 * 1. ドキュメントが開かれているかチェックする
 * 2. ScriptUIでダイアログ(操作パネル)を組み立てる
 * 3. 実行ボタンが押下時に入力値の検証を行う
 * 4. 選択モードに応じて createSequence() / applySequenceToSelection() のいずれかを呼び出す
 */
function main() {

// ================================
// 1. ドキュメントが開かれているかチェックする
// ================================
// 開いているドキュメントの数が0だった場合
if (app.documents.length === 0) {
    alert("ドキュメントを開いてから実行してください。");
    return;
}
var doc = app.activeDocument; // アクティブなドキュメントを取得します

// ================================
// 2. ScriptUIでダイアログ(操作パネル)を組み立てる
// ================================
// ツールのダイアログを作成する
var dlg = new Window("dialog", "連番作成ツール");
dlg.orientation = "column"; // 列 (要素を縦方向に配置する)
dlg.alignChildren = "fill"; // 子要素の横方向配置 : 横幅に対して揃える(横幅いっぱい)

// ---- モード選択パネル ----
// ラジオボタン rb で 新規作成 / 選択中テキストに割り当て を選択する
var modePanel = dlg.add("panel", undefined, "モード");//項目名
modePanel.orientation = "row"; // 行 (要素を横方向に配置する)
// rbCreate : 新規作成
var rbCreate = modePanel.add("radiobutton", undefined, "新規に連番オブジェクトを作成");
// rbApply : 選択中テキストに割り当て
var rbApply = modePanel.add("radiobutton", undefined, "選択中のテキストに連番を割り当て");
rbCreate.value = true; // デフォルトは新規作成を選択状態にしています

// ---- 番号(値)設定パネル (両方のモードで共通) ----
// 作成する数字の並びに関する設定項目
// 開始番号・個数・増分・桁数・接頭辞/接尾辞など
var commonPanel = dlg.add("panel", undefined, "番号設定");//項目名
commonPanel.orientation = "column";// 列
commonPanel.alignChildren = "left";// 横幅に対して左揃え
    // ---- 1行目の設定項目 ----
    var g1 = commonPanel.add("group");
    // 開始番号 デフォルト 1 テキスト入力欄
    g1.add("statictext", undefined, "開始番号:");
    var etStart = g1.add("edittext", undefined, "1");
        etStart.characters = 6;//6桁まで
    // テキストオブジェクト個数 デフォルト 10 テキスト入力欄
    g1.add("statictext", undefined, "個数:");
    var etCount = g1.add("edittext", undefined, "10");
        etCount.characters = 6;
    // 増分(インターバル値) デフォルト1 テキスト入力欄
    // 例: 1→1ずつ増やす。 2なら1,3,5...
    g1.add("statictext", undefined, "増分:");
    var etStep = g1.add("edittext", undefined, "1");
        etStep.characters = 4;

    // ---- 2行目の設定項目 ----
    var g2 = commonPanel.add("group");
    // 桁数設定。指定連番最大値よりも桁数が大きい場合に0で埋める　デフォルト 0
    // 例: 3なら 001, 002...
    g2.add("statictext", undefined, "桁数(ゼロ埋め・0で無効):");
    var etDigits = g2.add("edittext", undefined, "0");
        etDigits.characters = 4;
    // 接頭辞 数字列の先頭に付加する文字列  例: "No."
    g2.add("statictext", undefined, "接頭辞:");
    var etPrefix = g2.add("edittext", undefined, "");
        etPrefix.characters = 6;
    // 接尾辞 数字列の末尾に付加する文字列  例: "番"
    g2.add("statictext", undefined, "接尾辞:");
    var etSuffix = g2.add("edittext", undefined, "");
        etSuffix.characters = 6;


// ---- 新規作成時のみの配置設定 ----
// ** 新規作成モード時のみ使用します **
// ** "選択したオブジェクトへの割り当て"モードの時は使いません **
//      → ケースごとに updatePanels() で無効化(グレーアウト)します
var createPanel = dlg.add("panel", undefined, "配置設定(新規作成モード時のみ有効)");
    createPanel.orientation = "column";// 列(縦)
    createPanel.alignChildren = "left";// 左寄せ

    // フォントサイズ(pt) / 文字間隔(Gap値/pt)
    var g3 = createPanel.add("group");
    g3.add("statictext", undefined, "フォントサイズ(pt):");
    var etSize = g3.add("edittext", undefined, "12");
        etSize.characters = 5;
    g3.add("statictext", undefined, "間隔(pt):");
    var etGap = g3.add("edittext", undefined, "20");
        etGap.characters = 5;

    // テキストオブジェクトを並べる方向 ... 縦 vertical / 横 horizontal / グリッド grid
    var g4 = createPanel.add("group");
        g4.add("statictext", undefined, "方向:");
    var rbHoriz = g4.add("radiobutton", undefined, "横並び");
    var rbVert = g4.add("radiobutton", undefined, "縦並び");
    var rbGrid = g4.add("radiobutton", undefined, "グリッド"); // 整列方向はケース分けで横/縦 以外はグリッドにしています...(後述
        rbHoriz.value = true; // デフォルトは横並びを選択
    
    // グリッド配置時の列数
    var g5 = createPanel.add("group");
        g5.add("statictext", undefined, "グリッド列数(グリッド選択時):");
    var etCols = g5.add("edittext", undefined, "5");
        etCols.characters = 4;


// ---- ボタンの設置 ----
// 以下のパネル初期化の前に処理する都合上、ここにコードを置いている
var btnGroup = dlg.add("group");
    btnGroup.alignment = "right";
    // ２種類のボタンを定義 (キャンセル) (実行)
    var btnCancel = btnGroup.add("button", undefined, "キャンセル", {name: "cancel"});
    var btnOK = btnGroup.add("button", undefined, "実行", {name: "ok"});


// ---- モード切り替え → パネルの有効/無効の切り替え ----
// "選択したオブジェクトへの割り当て"モード のときは新規作成時(ラジオボタン rbCreate)の配置設定(createPanel)は不要なので、
// 該当部分パネルを非活性化(グレーアウト)します
function updatePanels() {
    // 新規作成時配置設定 rbCreateの有効/無効 の値を 配置設定 createPanelにも付与する
    createPanel.enabled = rbCreate.value;
}

// ラジオボタン rbCreate / rbApply を選択時の切り替え
rbCreate.onClick = updatePanels;
rbApply.onClick = updatePanels;
// 初期状態の指定
updatePanels();


// ================================
// 実行ボタン押下時の処理
// ================================
btnOK.onClick = function () {
    // テキスト入力欄の値を数値(10新数)へ変換する
    var start = parseInt(etStart.text, 10);// 開始値
    var count = parseInt(etCount.text, 10);// 設置個数
    var step = parseInt(etStep.text, 10);// インターバル値(増分)
    var digits = parseInt(etDigits.text, 10);// 桁数
    // 接頭辞, 接尾辞 の値
    var prefix = etPrefix.text;
    var suffix = etSuffix.text;
    // 必須入力項目のチェック   上のparseIntができない時はNotANumber
    if (isNaN(start) || isNaN(step) || isNaN(digits)) {
        alert("開始番号・増分・桁数の入力を確認してください。");
        return;// return → ダイアログそのまま
    }
    // ---- 新規作成の場合 ----
    if (rbCreate.value) {
        var size = parseFloat(etSize.text);// フォントサイズ
        var gap = parseFloat(etGap.text);// オブジェクト間隔
        var cols = parseInt(etCols.text, 10);// グリッド列数
        // オブジェクト設置個数のチェック  要 1以上の指定
        if (isNaN(count) || count <= 0) {
            alert("個数を正しく入力してください。");
            return;
        }
        if (isNaN(size) || isNaN(gap)) {
            alert("フォントサイズ・間隔の入力を確認してください。");
            return;
        }
        // グリッド指定が 1以上でないときは強制的に1 (1列で出力されます)
        if (isNaN(cols) || cols <= 0) cols = 1;

        /**
         * ラジオボタンの選択内容から配置を選択する
         *   var rbHoriz = g4.add("radiobutton", undefined, "横並び"); → "h"
         *   var rbVert = g4.add("radiobutton", undefined, "縦並び"); → "v"
         *   var rbGrid = g4.add("radiobutton", undefined, "グリッド"); ※ 上記以外 → "grid"
         *   ※横並び, 縦並び の両方でない場合に "grid"になります
        */
        var layout = rbHoriz.value ? "h" : (rbVert.value ? "v" : "grid");

        createSequence(doc, start, count, step, digits, prefix, suffix, size, gap, layout, cols);

    } else {

    // ---- "選択したオブジェクトへの割り当て"モード の場合 ----
    applySequenceToSelection(doc, start, step, digits, prefix, suffix);

    }
    // createSequence() or applySequenceToSelection() の完了後にダイアログを閉じる
    dlg.close();

};// btnOK.onClick 


// ================================
// キャンセルボタン押下時の処理 ... 何もしない / ダイアログを閉じる
// ================================
btnCancel.onClick = function () {
    dlg.close();
};

// ================================
// スクリプト実行時の最終処理 → モーダルダイアログを表示する
//          ... ダイアログの作成スクリプトが完了して ユーザーの操作待ちに移行
// ================================
dlg.show();

}// function main()


// -----------------------------------------------------


/**
 * createSequence
 *
 * 「新規作成モード」の処理
 * 新規に連番テキストオブジェクトを作成する
 * 開始位置はアクティブなアートボードの左上の角を起点にcount個の連番テキストオブジェクトを
 * layoutで指定された方向に生成します。
 * (ちなみに生成されるテキストオブジェクトはポイント文字にしています)
 * @param {app.activeDocument} doc 
 * @param {num} start 開始番号
 * @param {num} count 設置個数
 * @param {num} step インターバル値
 * @param {num} digits 桁数(0はゼロ埋めなし)
 * @param {string} prefix 接頭辞
 * @param {string} suffix 接尾辞
 * @param {num} size フォントサイズ(pt)
 * @param {num} gap テキストオブジェクトの配置間隔(pt)
 * @param {string} layout レイアウト方向 "h"(横並び) / "v"(縦並び) / "grid"(グリッド)
 * @param {num} cols グリッドは一時の列数
 */
function createSequence(doc, start, count, step, digits, prefix, suffix, size, gap, layout, cols) {
    // 出力対象アートボードの座標を取得する
    //var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var activeIdx = doc.artboards.getActiveArtboardIndex();// アクティブなアートボードのindex(0から始まる番号)
    var artboard = doc.artboards[activeIdx];// Indexからアートボードのオブジェクトを取得する
    var artboardRect = artboard.artboardRect; // abRect = [left, top, right, bottom] 単位はpt

    // ==== 出力位置の調整 ====
    /**
     * ---- Illustratorの座標設定について ----
     * Illustratorの座標は 定規の原点を変更しない限り、Y軸の増減が普通と「逆」です
     * グローバル座標 : スクリプト上のアートボードの左上の角を原点(0,0)として以下のように操作できます
     *   ** X軸は右方向はプラス+。左方向はマイナス- することで操作できる **
     *   ** Y軸は上方向はプラス+。下方向に向かってマイナス- **
     *   ※ 例：縦横100ptのアートボードの場合... 左上（原点）： (0, 0), 右上： (100, 0), 左下： (0, -100), 右下： (100, -100)
     */
    // アートボードの少し内側の設定値を作成
    var originX = artboardRect[0] + 20; // 右に20ずらす left + 20 →→
    var originY = artboardRect[1] - 20; // 下に20ずらす top - 20 ↓↓
    
    // アクティブなレイヤーを取得する ... 生成テキストオブジェクトの出力先
    var layer = doc.activeLayer;

    // ==== 連番テキストオブジェクトの生成 count 設置個数 分の回数の繰り返し処理
    for (var i = 0; i < count; i++) {
        // start 開始値に "step インターバル値"x"i 何個めのテキストか" を足すと出力する数字になる
        var num = start + i * step;
        // digits 桁指定 が無効値0でないときに function zeroPad(), そうでないときはそのままString化
        var numStr = digits > 0 ? zeroPad(num, digits) : String(num);
        var content = prefix + numStr + suffix; // 生成内容に合成 接頭辞+0埋め結果数字+接尾辞
        // 生成テキストオブジェクトの配置座標を作成する
        var x, y;
        // --- 水平方向の場合
        if (layout === "h") {
            x = originX + i * gap;//x横方向にgap 間隔設定値を増加
            y = originY;
        // --- 垂直方向の場合
        } else if (layout === "v") {
            x = originX;
            y = originY - i * gap;//y縦方向にgap 間隔設定値をマイナス
        // --- グリッドの場合
        } else {
            // 何列目か (0始まり)... 何番目/cols設定列数の除算の余り
            var col = i % cols;
                x = originX + col * gap;// x横方向に列数とgap分
            // 何行目か (0始まり)...   何番目/cols設定列数
            var row = Math.floor(i / cols);
                y = originY - row * gap;// y縦方向に行数とgap分
        }
        // ポイント文字を x, y 座標へ生成
        var textFrame = layer.textFrames.pointText([x, y]);
        textFrame.contents = content; // テキスト生成内容 content を反映
        // フォントサイズを設定する
        // 適用範囲をテキストフレームで指定しているので、生成したテキストオブジェクト自体に変更がかかるはず... 失敗したらスルーできるようにtry-catch
        try {
            textFrame.textRange.characterAttributes.size = size;
        } catch (e) {
            // フォントサイズ設定に失敗した場合はデフォルトのままになります
        }

    }
}// function createSequence


// -----------------------------------------------------


/**
 * applySequenceToSelection
 *
 * 「選択オブジェクトへの割り当て(採番)モード」の処理
 * 
 * 選択中のオブジェクトからテキストフレームだけを抽出し、配置を調整。
 * その後、連番に書き換えます
 * 
 * @param {app.activeDocument} doc 
 * @param {num} start 開始番号
 * @param {num} step インターバル値
 * @param {num} digits 桁数(0はゼロ埋めなし)
 * @param {string} prefix 接頭辞
 * @param {string} suffix 接尾辞
 * @returns 
 */
// 選択中のテキストオブジェクトに連番を割り当て
function applySequenceToSelection(doc, start, step, digits, prefix, suffix) {
    // 現在選択中のオブジェクトを取得します selectItems: [obj]
    var selectedItems = doc.selection;

    // 選択されたオブジェクトがない場合は処理終了
    if (!selectedItems || selectedItems.length === 0) { // 要素が見つからない or 空配列
        alert("番号を割り当てたいテキストオブジェクトを選択してください。");
        return;
    }
    // ==== selectedItems 選択中のオブジェクトの中からテキストオブジェクト(TextFrame)だけを抽出する
    var targetObjects = []; // テキストオブジェクトを押し込む配列
    for (var i = 0; i < selectedItems.length; i++) {
        if (selectedItems[i].typename === "TextFrame") {
            targetObjects.push( selectedItems[i] ); // テキストオブジェクトをまとめる
        }
    }
    // テキストオブジェクトがない場合には処理を中断する
    if (targetObjects.length === 0) {
        alert("選択範囲にテキストオブジェクトが含まれていません。");
        return;
    }

    // ==== 取得したテキストオブジェクトをソートする (上から下、同じ行位置にあると判断できる場合なら左から右へ)
    // sort( a.top - b.top > 高さの差が誤差といえる範囲 ) → 縦並びor行で並べてあるが、別の行に位置するオブジェクトと判断する
    //  →→  sort( b.top - a.top ) で降順に並べる
    //       IllustratorのY座標は上に行くほど値が大きい(下に向かってマイナス)
    //       Y座標(top)の大きい方=より上にある方を先に並べる
    // sort( a.top - b.top =< 高さの差が誤差といえる範囲 ) → 横並びになっていると判断する
    //  →→  sort( a.left - b.left ) で降順に並べる
    //       横並び=同じ行 とみなせる場合は、X座標(left)が小さい方=より左にある方を先に並べる
    targetObjects.sort(function (a, b) {
        var rowTolerance = 5; // 同じ「行」とみなすY座標の誤差許容範囲 (pt単位の許容誤差) = 高さの差が誤差といえる範囲
        // Y座標の差が 許容値 rowTolerance よりも大きい => 行(横)並びではないと判断
        if (Math.abs(a.top - b.top) > rowTolerance) {
            return b.top - a.top; // Y座標(top)の大きい方を先に並べる...Illustrator座標系はy値が大きいほど上(より上にある)
        }
        // 行(横)並びの場合は X座標(left)が小さい = より左にある ものを先に並べる
        return a.left - b.left;
    });
    // ==== 並び替え結果に連番を割り当て
    for (var j = 0; j < targetObjects.length; j++) {
        var num = start + j * step;
        // digits 桁指定 が無効値0でないときに function zeroPad(), そうでないときはそのままString化
        var numStr = digits > 0 ? zeroPad(num, digits) : String(num);
        // テキストオブジェクトの中身を生成連番に書き換えます。 ※既存の中身を上書き
        targetObjects[j].contents = prefix + numStr + suffix;//接頭辞、接尾辞の付与
    }
}// function applySequenceToSelection


// 初期化・実行
main();
