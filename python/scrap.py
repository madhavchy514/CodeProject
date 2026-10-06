import os
import sys

def venv_python():
  venv = os.path.abspath('.venv/bin/python')
  if sys.executable != venv and os.path.exists(venv):
    os.execl(venv, venv, *sys.argv)

venv_python()
import selenium.webdriver
import selenium.webdriver.chrome.options

def open_driver(browser_path: str = '/usr/bin/brave-browser'):
  opts = selenium.webdriver.chrome.options.Options()
  opts.binary_location = browser_path
  opts.add_argument('--disable-blink-features=AutomationControlled')
  return selenium.webdriver.Chrome(options=opts)

def close_driver(driver: selenium.webdriver):
  driver.close()
  driver.quit()

def find_link(site_url: str, video_query_selector: str, driver: selenium.webdriver) -> str | None:
  driver.get(site_url)
  video_src = driver.execute_script(f'''
    let video = document.querySelector('{video_query_selector}');
    return (video ? video.src ? video.src : null : null);
  ''')

  if not video_src:
    return None

  return video_src