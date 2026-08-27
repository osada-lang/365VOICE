import base64

logo_path = "/Users/kentosada/dev/365VOICE/365_logo.jpg"
with open(logo_path, "rb") as f:
    b64_data = base64.b64encode(f.read()).decode("utf-8")
data_url = f"data:image/jpeg;base64,{b64_data}"

html_path = "/Users/kentosada/dev/365VOICE/diagnosis_sheet.html"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Replace time
html = html.replace("⏱ 所要時間：約3分", "⏱ 所要時間：約10分")

# Add CSS for company logo
css_replacement = """    /* Top Header */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .company-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .company-logo {
      height: 28px;
      width: auto;
      object-fit: contain;
    }
    .company-name {
      font-size: 13px;
      font-weight: bold;
      color: #1b365d;
    }"""

html = html.replace("""    /* Top Header */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .company-name {
      font-size: 12px;
      font-weight: bold;
      color: #1b365d;
    }""", css_replacement)

# Replace top-bar company area
brand_replacement = f"""  <!-- Top Bar -->
  <div class="top-bar">
    <div class="company-brand">
      <img src="{data_url}" alt="365 Logo" class="company-logo">
      <div class="company-name">株式会社365</div>
    </div>"""

html = html.replace("""  <!-- Top Bar -->
  <div class="top-bar">
    <div class="company-name">株式会社365</div>""", brand_replacement)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)

# Also update Downloads
downloads_path = "/Users/kentosada/Downloads/diagnosis_sheet.html"
with open(downloads_path, "w", encoding="utf-8") as f:
    f.write(html)

print("Updated diagnosis_sheet.html with logo and 10 minutes successfully.")
