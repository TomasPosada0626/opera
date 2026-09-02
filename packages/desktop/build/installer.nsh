; Incluido por electron-builder (ver electron-builder.json5, nsis.include).
; Agrega, sobre el wizard NSIS que arma electron-builder solo, dos pasos
; aprobados en plan mode con el usuario:
;
;   1. Instalación silenciosa de Docker Desktop, solo si hace falta, con
;      consentimiento explícito en una página propia del wizard.
;   2. Casilla "crear acceso directo en el escritorio", marcada por defecto.
;
; `perMachine: true` (electron-builder.json5) ya fuerza que TODO el
; instalador corra elevado (UAC) desde el arranque -- dism.exe y el
; instalador de Docker Desktop necesitan admin sí o sí, así que nada de lo
; que sigue necesita su propia elevación anidada.

!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "LogicLib.nsh"

; electron-builder compila este script dos veces -- una para el instalador,
; otra (con BUILD_UNINSTALLER definido) solo para el stub del desinstalador,
; que nunca inserta customPageAfterChangeDir/customInstall. Sin este guard,
; en esa segunda pasada estas variables quedan declaradas pero jamás
; referenciadas, y NSIS trata esa advertencia como error (encontrado
; compilando: "warning 6001: ... not referenced or never set").
!ifndef BUILD_UNINSTALLER
  Var DockerCheckbox
  Var DockerCheckboxState
  Var ShortcutCheckbox
  Var ShortcutCheckboxState
  Var DockerAlreadyRunning
!endif

!macro customPageAfterChangeDir
  Page custom OperaOptionsPageCreate OperaOptionsPageLeave

  Function OperaOptionsPageCreate
    ; Se chequea acá (no antes) porque recién ahora, en runtime, sabemos si
    ; hace falta ofrecer instalar Docker -- en build time no hay forma de
    ; saberlo.
    StrCpy $DockerAlreadyRunning "0"
    nsExec::ExecToLog 'docker info'
    Pop $0
    ${If} $0 == "0"
      StrCpy $DockerAlreadyRunning "1"
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${If} $DockerAlreadyRunning == "0"
      ${NSD_CreateLabel} 0 0 100% 50u "Opera necesita Docker Desktop para guardar su información. No lo encontramos instalado y funcionando en esta PC -- Opera puede instalarlo automáticamente (la descarga ya viene incluida en este instalador). Si hace falta, la PC se va a reiniciar sola durante la instalación para terminar de activarlo."
      Pop $0
      ${NSD_CreateCheckbox} 0 55u 100% 12u "Instalar Docker Desktop automáticamente"
      Pop $DockerCheckbox
      ${NSD_SetState} $DockerCheckbox ${BST_CHECKED}
      ${NSD_CreateCheckbox} 0 80u 100% 12u "Crear acceso directo en el escritorio"
      Pop $ShortcutCheckbox
      ${NSD_SetState} $ShortcutCheckbox ${BST_CHECKED}
    ${Else}
      ${NSD_CreateLabel} 0 0 100% 24u "Docker Desktop ya está instalado y funcionando en esta PC -- Opera lo va a usar tal cual está."
      Pop $0
      ${NSD_CreateCheckbox} 0 30u 100% 12u "Crear acceso directo en el escritorio"
      Pop $ShortcutCheckbox
      ${NSD_SetState} $ShortcutCheckbox ${BST_CHECKED}
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function OperaOptionsPageLeave
    ${If} $DockerAlreadyRunning == "0"
      ${NSD_GetState} $DockerCheckbox $DockerCheckboxState
    ${Else}
      StrCpy $DockerCheckboxState ${BST_UNCHECKED}
    ${EndIf}
    ${NSD_GetState} $ShortcutCheckbox $ShortcutCheckboxState
  FunctionEnd
!macroend

!macro customInstall
  ${If} $ShortcutCheckboxState == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\Opera.lnk" "$INSTDIR\Opera.exe"
  ${EndIf}

  ${If} $DockerCheckboxState == ${BST_CHECKED}
    !insertmacro InstallDockerDesktop
  ${EndIf}

  ; El instalador de Docker Desktop embebido solo hace falta durante ESTA
  ; instalación -- no tiene sentido dejarlo ocupando ~600 MB para siempre en
  ; el disco de quien instaló Opera. No se llega acá si `Reboot` disparó más
  ; arriba (a propósito: la reanudación después del reinicio necesita este
  ; mismo archivo todavía).
  Delete "$INSTDIR\resources\docker\Docker Desktop Installer.exe"
  RMDir "$INSTDIR\resources\docker"
!macroend

; Código 3010 de DISM/MSI = "la operación terminó bien pero hace falta
; reiniciar para que quede activa" -- no es un error.
!define DISM_REBOOT_REQUIRED "3010"

!macro InstallDockerDesktop
  DetailPrint "Opera: activando Windows Subsystem for Linux..."
  nsExec::ExecToLog 'dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart'
  Pop $1

  DetailPrint "Opera: activando Virtual Machine Platform..."
  nsExec::ExecToLog 'dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart'
  Pop $0

  DetailPrint "Opera: instalando Docker Desktop (puede tardar varios minutos)..."
  ExecWait '"$INSTDIR\resources\docker\Docker Desktop Installer.exe" install --quiet --accept-license --backend=wsl2' $2
  DetailPrint "Opera: instalador de Docker Desktop terminó con código $2"

  ${If} $1 == ${DISM_REBOOT_REQUIRED}
  ${OrIf} $0 == ${DISM_REBOOT_REQUIRED}
    ; $EXEPATH: el propio instalador de Opera, tal como se está ejecutando
    ; ahora -- retoma la instalación completa (este mismo macro incluido)
    ; después del reinicio. Se borra sola más abajo apenas Docker queda
    ; funcionando (o definitivamente no puede).
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OperaFinishSetup" '"$EXEPATH"'
    MessageBox MB_OK|MB_ICONINFORMATION "Windows necesita reiniciarse para terminar de activar Docker Desktop. La PC se va a reiniciar sola -- cuando vuelva a iniciar sesión, la instalación de Opera continúa donde quedó."
    Reboot
    Return
  ${EndIf}

  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OperaFinishSetup"

  nsExec::ExecToLog 'docker info'
  Pop $0
  ${If} $0 != "0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Docker Desktop no pudo iniciar. La causa más común es que la virtualización (Intel VT-x/AMD-V) esté desactivada en el BIOS/UEFI de esta PC -- buscá una opción llamada algo como 'Intel Virtualization Technology', 'AMD-V' o 'SVM Mode' y activala ahí, después abrí Opera de nuevo."
  ${EndIf}
!macroend
