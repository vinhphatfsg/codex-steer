use framework "Foundation"

on run argv
  if (count of argv) is not 2 then error "Expected wait time and submit shortcut." number 64

  set messageText to (current application's NSProcessInfo's processInfo()'s environment()'s objectForKey:"CODEX_STEER_MESSAGE") as text
  if messageText is "" then error "CODEX_STEER_MESSAGE is empty." number 64
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

      set targetElement to missing value
      try
        set focusedElement to value of attribute "AXFocusedUIElement"
        set focusedRole to role of focusedElement
        if focusedRole is "AXTextArea" or focusedRole is "AXTextField" then set targetElement to focusedElement
      end try

      if targetElement is missing value then
        set targetY to -1
        set windowContents to entire contents of front window
        repeat with candidate in windowContents
          try
            set candidateRole to role of candidate
            if (candidateRole is "AXTextArea" or candidateRole is "AXTextField") and (enabled of candidate is true) then
              set candidatePosition to position of candidate
              set candidateY to item 2 of candidatePosition
              if candidateY > targetY then
                set targetY to candidateY
                set targetElement to candidate
              end if
            end if
          end try
        end repeat
      end if

      if targetElement is missing value then error "Codex accessibility tree contains no text editor. Run codex-steer debug-ui <thread-id>." number 69
      set focused of targetElement to true
    end tell
  end tell

  set oldClipboard to the clipboard as record
  try
    set the clipboard to messageText
    tell application "System Events"
      keystroke "v" using {command down}
      delay 0.15
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
