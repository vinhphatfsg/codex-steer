on run argv
  if (count of argv) is not 3 then error "Expected wait time, submit shortcut, and message." number 64

  set messageText to item 3 of argv
  if messageText is "" then error "Message is empty." number 64
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

  set oldClipboard to the clipboard as record
  try
    set the clipboard to messageText
    tell application "System Events"
      keystroke "v" using {command down}
      delay 0.3
      if submitShortcut is "command" then
        key code 36 using {command down}
      else if submitShortcut is "command-shift" then
        key code 36 using {command down, shift down}
      else
        key code 36
      end if
      delay 0.1
    end tell
    set the clipboard to oldClipboard
  on error errorMessage number errorNumber
    set the clipboard to oldClipboard
    error errorMessage number errorNumber
  end try

  return "sent"
end run
