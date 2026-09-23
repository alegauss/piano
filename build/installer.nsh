; MIDI and MusicXML files, offered to the piano without taking them over.
;
; A .mid belongs to whatever the person already plays it with and a .musicxml
; to whichever notation editor they installed, so the piano appears under Open
; With and never becomes the default: an OpenWithProgids value names it as a
; candidate, where a default verb would replace whatever was there.
; electron-builder's own file associations always set the default, which is
; right for .piano and wrong here, so both are registered by hand.
; SHELL_CONTEXT is the current user for this per-user install.
;
; .xml is claimed by neither macro. The app opens one handed to it by name, and
; half the files on a disk are some other XML.

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.midi" "" "MIDI file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.midi\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.midi\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\.mid\OpenWithProgids" "Piano.midi" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.midi\OpenWithProgids" "Piano.midi" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.musicxml" "" "MusicXML score"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.musicxml\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Piano.musicxml\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\.musicxml\OpenWithProgids" "Piano.musicxml" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.mxl\OpenWithProgids" "Piano.musicxml" ""
  ; Tell Explorer the associations changed, so Open With lists the piano now.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mid\OpenWithProgids" "Piano.midi"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.midi\OpenWithProgids" "Piano.midi"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Piano.midi"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.musicxml\OpenWithProgids" "Piano.musicxml"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mxl\OpenWithProgids" "Piano.musicxml"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Piano.musicxml"
  ; electron-builder's own unassociate takes the "Piano score" program id away
  ; and leaves .piano naming it, a claim on a program that is no longer there.
  ; The extension is the piano's own, so it goes too, unless something else has
  ; taken it since.
  Push $0
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.piano" ""
  StrCmp $0 "Piano score" 0 +2
  DeleteRegKey SHELL_CONTEXT "Software\Classes\.piano"
  Pop $0
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
