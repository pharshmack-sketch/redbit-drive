; п.9и ТЗ — Windows Explorer integration
; Добавляет пункт «Отправить в RedBit Drive» в контекстное меню проводника

!macro customInstall
  ; Пункт для всех файлов
  WriteRegStr HKCU "Software\Classes\*\shell\RedBitDrive" "" "Отправить в RedBit Drive"
  WriteRegStr HKCU "Software\Classes\*\shell\RedBitDrive" "Icon" "$INSTDIR\RedBit Drive.exe,0"
  WriteRegStr HKCU "Software\Classes\*\shell\RedBitDrive\command" "" '"$INSTDIR\RedBit Drive.exe" --upload "%1"'

  ; Пункт для папок
  WriteRegStr HKCU "Software\Classes\Directory\shell\RedBitDrive" "" "Отправить папку в RedBit Drive"
  WriteRegStr HKCU "Software\Classes\Directory\shell\RedBitDrive" "Icon" "$INSTDIR\RedBit Drive.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\shell\RedBitDrive\command" "" '"$INSTDIR\RedBit Drive.exe" --upload-folder "%1"'

  ; Пункт для фона папки (ПКМ на пустом месте)
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\RedBitDrive" "" "Открыть RedBit Drive здесь"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\RedBitDrive" "Icon" "$INSTDIR\RedBit Drive.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\RedBitDrive\command" "" '"$INSTDIR\RedBit Drive.exe" --open-folder "%V"'

  ; Регистрация URL-схемы redbitdrive://
  WriteRegStr HKCU "Software\Classes\redbitdrive" "" "URL:RedBit Drive Protocol"
  WriteRegStr HKCU "Software\Classes\redbitdrive" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\redbitdrive\DefaultIcon" "" "$INSTDIR\RedBit Drive.exe,0"
  WriteRegStr HKCU "Software\Classes\redbitdrive\shell\open\command" "" '"$INSTDIR\RedBit Drive.exe" "%1"'

  ; Автозапуск (опционально — не включён по умолчанию)
  ; WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "RedBitDrive" "$INSTDIR\RedBit Drive.exe --minimized"
!macroend

!macro customUninstall
  ; Удаляем все записи реестра
  DeleteRegKey HKCU "Software\Classes\*\shell\RedBitDrive"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\RedBitDrive"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\RedBitDrive"
  DeleteRegKey HKCU "Software\Classes\redbitdrive"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "RedBitDrive"
!macroend
