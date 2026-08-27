import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def create_diagnosis_sheet(output_path="365店舗集客_リピート診断シート.xlsx"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "診断シート"

    # Show grid lines
    ws.views.sheetView[0].showGridLines = True

    # Color Palette (365VOICE Style: Navy/Blue accent)
    NAVY_DARK = "1B365D"    # Primary header
    BLUE_ACCENT = "2E6B9E"  # Section headers
    LIGHT_BG = "F4F7FA"     # Highlight boxes / point boxes
    BORDER_COLOR = "CCCCCC" # Cell borders
    TEXT_DARK = "222222"    # Main text
    POINT_BG = "FFF9E6"     # Yellow tint for points
    POINT_BORDER = "FFE082"

    # Common styles
    font_title = Font(name="游ゴシック", size=16, bold=True, color="FFFFFF")
    font_subtitle = Font(name="游ゴシック", size=9, italic=True, color="E0E0E0")
    font_badge = Font(name="游ゴシック", size=9, bold=True, color="1B365D")

    font_sec_header = Font(name="游ゴシック", size=11, bold=True, color="FFFFFF")
    font_q_num = Font(name="游ゴシック", size=10, bold=True, color="1B365D")
    font_q_title = Font(name="游ゴシック", size=10, bold=True, color="222222")
    font_normal = Font(name="游ゴシック", size=9.5, color="333333")
    font_point = Font(name="游ゴシック", size=9, color="8A5300", bold=True)
    font_small = Font(name="游ゴシック", size=8.5, color="666666")

    fill_navy = PatternFill(start_color=NAVY_DARK, end_color=NAVY_DARK, fill_type="solid")
    fill_section = PatternFill(start_color=BLUE_ACCENT, end_color=BLUE_ACCENT, fill_type="solid")
    fill_light = PatternFill(start_color=LIGHT_BG, end_color=LIGHT_BG, fill_type="solid")
    fill_point = PatternFill(start_color=POINT_BG, end_color=POINT_BG, fill_type="solid")
    fill_badge = PatternFill(start_color="E8F1F8", end_color="E8F1F8", fill_type="solid")

    thin_side = Side(style="thin", color=BORDER_COLOR)
    border_all = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    border_point = Border(
        left=Side(style="thin", color=POINT_BORDER),
        right=Side(style="thin", color=POINT_BORDER),
        top=Side(style="thin", color=POINT_BORDER),
        bottom=Side(style="thin", color=POINT_BORDER)
    )

    # Set Column Widths (12 columns total, A-F for Left Column, G-L for Right Column)
    col_widths = {
        'A': 4,  'B': 14, 'C': 14, 'D': 14, 'E': 14, 'F': 14,
        'G': 4,  'H': 14, 'I': 14, 'J': 14, 'K': 14, 'L': 14
    }
    for col, width in col_widths.items():
        ws.column_dimensions[col].width = width

    # Row 1: Company Name & Badges
    ws.merge_cells("A1:F1")
    ws["A1"] = "株式会社365"
    ws["A1"].font = Font(name="游ゴシック", size=10, bold=True, color="1B365D")
    ws["A1"].alignment = Alignment(horizontal="left", vertical="center")

    ws.merge_cells("G1:L1")
    ws["G1"] = "所要時間：約3分  |  ✔ チェックするだけ  |  ★ 無料診断付き  |  専門知識不要"
    ws["G1"].font = font_badge
    ws["G1"].fill = fill_badge
    ws["G1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 22

    # Row 2 & 3: Header Banner
    ws.merge_cells("A2:L2")
    ws["A2"] = "365 店舗集客・リピート診断シート ver.1"
    ws["A2"].font = font_title
    ws["A2"].fill = fill_navy
    ws["A2"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 30

    ws.merge_cells("A3:L3")
    ws["A3"] = "〜 お客様の声を資産化し、再来店・リピートの流れを最適化するために 〜"
    ws["A3"].font = font_subtitle
    ws["A3"].fill = fill_navy
    ws["A3"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[3].height = 18

    # Row 4: Spacer
    ws.row_dimensions[4].height = 8

    # Row 5: Contact Info Header
    ws.merge_cells("A5:L5")
    ws["A5"] = "【 ご記入者情報 】 ※ご連絡先（電話番号・メールアドレス）のご記入は不要です。"
    ws["A5"].font = Font(name="游ゴシック", size=10, bold=True, color="1B365D")
    ws["A5"].fill = fill_light
    ws["A5"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[5].height = 22

    # Row 6: Contact Info Fields
    ws.merge_cells("A6:B6")
    ws["A6"] = "店舗名・貴社名："
    ws["A6"].font = font_q_title
    ws["A6"].alignment = Alignment(horizontal="right", vertical="center")

    ws.merge_cells("C6:F6")
    ws["C6"].border = Border(bottom=Side(style="thin", color="1B365D"))

    ws.merge_cells("G6:H6")
    ws["G6"] = "ご担当者様お名前："
    ws["G6"].font = font_q_title
    ws["G6"].alignment = Alignment(horizontal="right", vertical="center")

    ws.merge_cells("I6:L6")
    ws["I6"].border = Border(bottom=Side(style="thin", color="1B365D"))
    ws.row_dimensions[6].height = 25

    # Row 7: Spacer
    ws.row_dimensions[7].height = 10

    # -------------------------------------------------------------
    # SECTION HEADERS (Row 8)
    # Left: Section 1 (A8:F8), Right: Section 3 (G8:L8)
    # -------------------------------------------------------------
    ws.merge_cells("A8:F8")
    ws["A8"] = " 1. 現在の集客状況について"
    ws["A8"].font = font_sec_header
    ws["A8"].fill = fill_section
    ws["A8"].alignment = Alignment(horizontal="left", vertical="center")

    ws.merge_cells("G8:L8")
    ws["G8"] = " 3. お客様との関係づくりについて（リピート対策）"
    ws["G8"].font = font_sec_header
    ws["G8"].fill = fill_section
    ws["G8"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[8].height = 24

    # Row 9: Q1-1 & Q3-1
    ws.merge_cells("A9:F9")
    ws["A9"] = "1-1 新規のお客様はどこから来ますか？（複数選択可）"
    ws["A9"].font = font_q_title
    ws["A9"].alignment = Alignment(horizontal="left", vertical="center")

    ws.merge_cells("G9:L9")
    ws["G9"] = "3-1 来店・来院されたお客様へのフォロー方法はありますか？（複数選択可）"
    ws["G9"].font = font_q_title
    ws["G9"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[9].height = 20

    # Row 10 & 11: Options for Q1-1 & Q3-1
    # Q1-1 Options
    q1_1_opts = [
        "□ Googleマップ", "□ Google検索", "□ Instagram", "□ TikTok", "□ LINE",
        "□ ホームページ", "□ チラシ", "□ 紹介", "□ 通りがかり", "□ その他（　　）"
    ]
    cols_left = ["A", "B", "C", "D", "E", "F"]
    ws.merge_cells("A10:B10"); ws["A10"] = "□ Googleマップ"; ws["A10"].font = font_normal
    ws.merge_cells("C10:D10"); ws["C10"] = "□ Google検索"; ws["C10"].font = font_normal
    ws.merge_cells("E10:F10"); ws["E10"] = "□ Instagram"; ws["E10"].font = font_normal

    ws.merge_cells("A11:B11"); ws["A11"] = "□ TikTok"; ws["A11"].font = font_normal
    ws.merge_cells("C11:D11"); ws["C11"] = "□ LINE公式"; ws["C11"].font = font_normal
    ws.merge_cells("E11:F11"); ws["E11"] = "□ ホームページ"; ws["E11"].font = font_normal

    ws.merge_cells("A12:B12"); ws["A12"] = "□ チラシ"; ws["A12"].font = font_normal
    ws.merge_cells("C12:D12"); ws["C12"] = "□ 紹介・通りがかり"; ws["C12"].font = font_normal
    ws.merge_cells("E12:F12"); ws["E12"] = "□ その他（　　　）"; ws["E12"].font = font_normal

    # Q3-1 Options
    ws.merge_cells("G10:H10"); ws["G10"] = "□ LINE公式"; ws["G10"].font = font_normal
    ws.merge_cells("I10:J10"); ws["I10"] = "□ 電話・SMS"; ws["I10"].font = font_normal
    ws.merge_cells("K10:L10"); ws["K10"] = "□ メールマガジン"; ws["K10"].font = font_normal

    ws.merge_cells("G11:H11"); ws["G11"] = "□ ハガキ・DM"; ws["G11"].font = font_normal
    ws.merge_cells("I11:J11"); ws["I11"] = "□ 特になし"; ws["I11"].font = font_normal
    ws.merge_cells("K11:L11"); ws["K11"] = "□ その他（　　　）"; ws["K11"].font = font_normal

    ws.row_dimensions[10].height = 20
    ws.row_dimensions[11].height = 20
    ws.row_dimensions[12].height = 20

    # Row 13: Spacer
    ws.row_dimensions[13].height = 8

    # Row 14: Q1-2 & Q3-2
    ws.merge_cells("A14:F14")
    ws["A14"] = "1-2 Googleマップからの来店はどれくらいありますか？"
    ws["A14"].font = font_q_title

    ws.merge_cells("G14:L14")
    ws["G14"] = "3-2 クーポンや特典の配信はしていますか？"
    ws["G14"].font = font_q_title
    ws.row_dimensions[14].height = 20

    # Row 15: Options Q1-2 & Q3-2
    ws.merge_cells("A15:B15"); ws["A15"] = "□ 多い"; ws["A15"].font = font_normal
    ws.merge_cells("C15:D15"); ws["C15"] = "□ 普通 / 少ない"; ws["C15"].font = font_normal
    ws.merge_cells("E15:F15"); ws["E15"] = "□ 分からない"; ws["E15"].font = font_normal

    ws.merge_cells("G15:I15"); ws["G15"] = "□ 定期的に配信している"; ws["G15"].font = font_normal
    ws.merge_cells("J15:L15"); ws["J15"] = "□ あまり配信していない / していない"; ws["J15"].font = font_normal
    ws.row_dimensions[15].height = 20

    # Row 16: Point Box for 1-2
    ws.merge_cells("A16:F16")
    ws["A16"] = "💡 ポイント：Googleマップからの来店が増えると、新規客数が大きくUPします。"
    ws["A16"].font = font_point
    ws["A16"].fill = fill_point
    ws["A16"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[16].height = 22

    # Row 17: Q1-3 & Q3-3
    ws.merge_cells("A17:F17")
    ws["A17"] = "1-3 現在、LINE公式アカウントはありますか？"
    ws["A17"].font = font_q_title

    ws.merge_cells("G17:L17")
    ws["G17"] = "3-3 お客様アンケートは実施していますか？"
    ws["G17"].font = font_q_title
    ws.row_dimensions[17].height = 20

    # Row 18: Options Q1-3 & Q3-3
    ws.merge_cells("A18:C18"); ws["A18"] = "□ 運用している（登録者約：　　名）"; ws["A18"].font = font_normal
    ws.merge_cells("D18:E18"); ws["D18"] = "□ アカウントのみある"; ws["D18"].font = font_normal
    ws["F18"] = "□ 無い"; ws["F18"].font = font_normal

    ws.merge_cells("G18:I18"); ws["G18"] = "□ 実施している（紙 / LINE等）"; ws["G18"].font = font_normal
    ws.merge_cells("J18:L18"); ws["J18"] = "□ 実施していない"; ws["J18"].font = font_normal
    ws.row_dimensions[18].height = 20

    # Row 19: Spacer
    ws.row_dimensions[19].height = 10

    # -------------------------------------------------------------
    # SECTION HEADERS (Row 20)
    # Left: Section 2 (A20:F20), Right: Section 4 (G20:L20)
    # -------------------------------------------------------------
    ws.merge_cells("A20:F20")
    ws["A20"] = " 2. Googleマップ（口コミ・投稿）について"
    ws["A20"].font = font_sec_header
    ws["A20"].fill = fill_section

    ws.merge_cells("G20:L20")
    ws["G20"] = " 4. 一番困っていること・解決したいこと"
    ws["G20"].font = font_sec_header
    ws["G20"].fill = fill_section
    ws.row_dimensions[20].height = 24

    # Row 21: Q2-1 & Q4-1
    ws.merge_cells("A21:F21")
    ws["A21"] = "2-1 口コミへの返信はどのくらいの頻度で行っていますか？"
    ws["A21"].font = font_q_title

    ws.merge_cells("G21:L21")
    ws["G21"] = "4-1 現在、一番困っていることは何ですか？（あてはまるものを3つまで）"
    ws["G21"].font = font_q_title
    ws.row_dimensions[21].height = 20

    # Row 22 & 23: Options Q2-1 & Q4-1
    ws.merge_cells("A22:C22"); ws["A22"] = "□ 毎回返信している"; ws["A22"].font = font_normal
    ws.merge_cells("D22:F22"); ws["D22"] = "□ 時々返信している"; ws["D22"].font = font_normal
    ws.merge_cells("A23:C23"); ws["A23"] = "□ ほとんどしていない"; ws["A23"].font = font_normal
    ws.merge_cells("D23:F23"); ws["D23"] = "□ 全くしていない"; ws["D23"].font = font_normal

    # Q4-1 Options (Right Column 4x3 grid)
    ws.merge_cells("G22:I22"); ws["G22"] = "□ 新規客数を増やしたい"; ws["G22"].font = font_normal
    ws.merge_cells("J22:L22"); ws["J22"] = "□ リピート率を上げたい"; ws["J22"].font = font_normal

    ws.merge_cells("G23:I23"); ws["G23"] = "□ 口コミ・評価を増やしたい"; ws["G23"].font = font_normal
    ws.merge_cells("J23:L23"); ws["J23"] = "□ LINE登録者を増やしたい"; ws["J23"].font = font_normal

    ws.merge_cells("G24:I24"); ws["G24"] = "□ MEO（マップ検索）対策したい"; ws["G24"].font = font_normal
    ws.merge_cells("J24:L24"); ws["J24"] = "□ 売上・客単価を上げたい"; ws["J24"].font = font_normal

    ws.merge_cells("G25:I25"); ws["G25"] = "□ 人手不足・採用対策"; ws["G25"].font = font_normal
    ws.merge_cells("J25:L25"); ws["J25"] = "□ その他（　　　　　　）"; ws["J25"].font = font_normal

    ws.row_dimensions[22].height = 20
    ws.row_dimensions[23].height = 20
    ws.row_dimensions[24].height = 20
    ws.row_dimensions[25].height = 20

    # Row 26: Q2-2 & Q4-2
    ws.merge_cells("A26:F26")
    ws["A26"] = "2-2 Googleマップへの投稿・最新情報の更新頻度は？"
    ws["A26"].font = font_q_title

    ws.merge_cells("G26:L26")
    ws["G26"] = "4-2 その他、特に解決したい課題（自由記述）"
    ws["G26"].font = font_q_title
    ws.row_dimensions[26].height = 20

    # Row 27 & 28: Options Q2-2 & Q4-2 Free text box
    ws.merge_cells("A27:C27"); ws["A27"] = "□ 定期的（週1回以上）"; ws["A27"].font = font_normal
    ws.merge_cells("D27:F27"); ws["D27"] = "□ 時々投稿している"; ws["D27"].font = font_normal
    ws.merge_cells("A28:C28"); ws["A28"] = "□ あまりしていない"; ws["A28"].font = font_normal
    ws.merge_cells("D28:F28"); ws["D28"] = "□ 投稿したことがない"; ws["D28"].font = font_normal

    # Q4-2 Free Text area
    ws.merge_cells("G27:L29")
    ws["G27"].fill = fill_light
    for r in range(27, 30):
        for c_idx in range(7, 13):
            col_let = get_column_letter(c_idx)
            ws[f"{col_let}{r}"].border = border_all

    ws.row_dimensions[27].height = 20
    ws.row_dimensions[28].height = 20
    ws.row_dimensions[29].height = 20

    # Row 30: Q2-3
    ws.merge_cells("A30:F30")
    ws["A30"] = "2-3 Googleマップの写真は定期的に更新していますか？"
    ws["A30"].font = font_q_title
    ws.row_dimensions[30].height = 20

    # Row 31: Options Q2-3
    ws.merge_cells("A31:B31"); ws["A31"] = "□ 定期的に更新"; ws["A31"].font = font_normal
    ws.merge_cells("C31:D31"); ws["C31"] = "□ 時々更新"; ws["C31"].font = font_normal
    ws.merge_cells("E31:F31"); ws["E31"] = "□ 更新していない"; ws["E31"].font = font_normal
    ws.row_dimensions[31].height = 20

    # Row 32: Point Box for Section 2
    ws.merge_cells("A32:F32")
    ws["A32"] = "💡 ポイント：口コミ返信・定期投稿・写真更新が信頼と来店を生みます。"
    ws["A32"].font = font_point
    ws["A32"].fill = fill_point
    ws["A32"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[32].height = 22

    # Row 33: Spacer
    ws.row_dimensions[33].height = 10

    # -------------------------------------------------------------
    # SECTION 5 & FOOTER BANNER (Row 34 onwards)
    # -------------------------------------------------------------
    ws.merge_cells("A34:L34")
    ws["A34"] = " 5. 無料診断・改善レポートのお申し込み"
    ws["A34"].font = font_sec_header
    ws["A34"].fill = fill_navy
    ws["A34"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[34].height = 25

    # Row 35: Free Diagnosis Offer Content
    ws.merge_cells("A35:H37")
    diagnosis_text = (
        "【無料診断でわかること・レポート内容】\n"
        "  ・Googleマップ（MEO）集客の改善ポイント & 伸びしろスコア\n"
        "  ・口コミ・高評価を自然に増やす仕組みのご提案\n"
        "  ・LINE公式アカウントを活用したリピート率改善施策"
    )
    ws["A35"] = diagnosis_text
    ws["A35"].font = font_normal
    ws["A35"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    ws.merge_cells("I35:L37")
    ws["I35"] = "☑ 無料診断レポートを希望する\n\n（チェックを入れてご提出ください）"
    ws["I35"].font = Font(name="游ゴシック", size=11, bold=True, color="1B365D")
    ws["I35"].fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
    ws["I35"].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws["I35"].border = Border(
        left=Side(style="medium", color="D6B656"),
        right=Side(style="medium", color="D6B656"),
        top=Side(style="medium", color="D6B656"),
        bottom=Side(style="medium", color="D6B656")
    )

    ws.row_dimensions[35].height = 22
    ws.row_dimensions[36].height = 22
    ws.row_dimensions[37].height = 22

    # Outer border styling for sections
    wb.save(output_path)
    print(f"Successfully generated reproduction Excel: {output_path}")

if __name__ == "__main__":
    create_diagnosis_sheet()
