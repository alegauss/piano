; MIDI files, offered to the piano without taking them over.
;
; A .mid belongs to whatever the person already plays it with, so the piano
; appears under Open With and never becomes the default: an OpenWithProgids
; value names it as a candidate, where a default verb would replace whatever
; was there. electron-builder's own file associations always set the default,
; which is right for .piano and wrong here, so MIDI is registered by hand.
; SHELL_CONTEXT is the current user for this per-user install.

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.midi" "" "MIDI file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.midi\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.midi\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\.mid\OpenWithProgids" "Piano.midi" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.midi\OpenWithProgids" "Piano.midi" ""
  ; Tell Explorer the associations changed, so Open With lists the piano now.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mid\OpenWithProgids" "Piano.midi"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.midi\OpenWithProgids" "Piano.midi"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Piano.midi"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
