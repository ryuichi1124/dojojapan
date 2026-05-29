import sys
from playwright.sync_api import sync_playwright


def main():
    if len(sys.argv) != 3:
        print("Usage: python tools/render_pdf.py <source-url> <target-pdf>", file=sys.stderr)
        raise SystemExit(1)

    source, target = sys.argv[1], sys.argv[2]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 794, "height": 1123})
        page.goto(source, wait_until="networkidle")
        page.pdf(
            path=target,
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
        )
        browser.close()


if __name__ == "__main__":
    main()
