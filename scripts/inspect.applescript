on run argv
  if (count of argv) is not 1 then error "Expected wait time in milliseconds." number 64
  set waitSeconds to ((item 1 of argv) as integer) / 1000

  tell application "ChatGPT" to activate
  delay waitSeconds

  tell application "System Events"
    set appProcess to first application process whose bundle identifier is "com.openai.codex"
    tell appProcess
      set frontmost to true
      if not (exists front window) then error "Codex Desktop has no front window." number 69
      set focusedElement to value of attribute "AXFocusedUIElement"
      set focusedRole to role of focusedElement as text
      set focusedSubrole to ""
      set focusedDescription to ""
      set focusedTitle to ""
      set focusedHelp to ""
      set windowTitle to ""
      try
        set focusedSubrole to (value of attribute "AXSubrole" of focusedElement) as text
      end try
      try
        set focusedDescription to (value of attribute "AXDescription" of focusedElement) as text
      end try
      try
        set focusedTitle to (value of attribute "AXTitle" of focusedElement) as text
      end try
      try
        set focusedHelp to (value of attribute "AXHelp" of focusedElement) as text
      end try
      try
        set windowTitle to (value of attribute "AXTitle" of front window) as text
      end try
    end tell
  end tell

  return "window_title=" & windowTitle & linefeed & ¬
    "focused_role=" & focusedRole & linefeed & ¬
    "focused_subrole=" & focusedSubrole & linefeed & ¬
    "focused_description=" & focusedDescription & linefeed & ¬
    "focused_title=" & focusedTitle & linefeed & ¬
    "focused_help=" & focusedHelp
end run
