on run argv
  if (count of argv) is not 2 then error "Expected wait time and submit shortcut." number 64
  set waitSeconds to ((item 1 of argv) as integer) / 1000
  set submitShortcut to item 2 of argv
  if submitShortcut is not "plain" and submitShortcut is not "command" and submitShortcut is not "command-shift" then error "Invalid submit shortcut." number 64

  tell application "ChatGPT" to activate
  delay waitSeconds

  tell application "System Events"
    set appProcess to first application process whose bundle identifier is "com.openai.codex"
    tell appProcess
      set frontmost to true
      if not (exists front window) then error "Codex Desktop has no front window." number 69
    end tell
  end tell

  tell application "System Events"
    if submitShortcut is "command" then
      key code 36 using {command down}
    else if submitShortcut is "command-shift" then
      key code 36 using {command down, shift down}
    else
      key code 36
    end if
    delay 0.1
  end tell

  return "sent"
end run
