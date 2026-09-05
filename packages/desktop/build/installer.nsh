; Incluido por electron-builder (ver electron-builder.json5, nsis.include).
; Agrega, sobre el wizard NSIS que arma electron-builder solo:
;
;   1. Instalación silenciosa de Docker Desktop, solo si hace falta, con
;      consentimiento explícito en una página propia del wizard.
;   2. Casilla "crear acceso directo en el escritorio", marcada por defecto.
;   3. Si Windows necesita reiniciar para activar WSL/Virtual Machine
;      Platform, un reinicio automático que retoma la instalación solo --
;      ver "Resumen tras reinicio" más abajo.
;
; `perMachine: true` (electron-builder.json5) ya fuerza que TODO el
; instalador corra elevado (UAC) desde el arranque -- dism.exe y el
; instalador de Docker Desktop necesitan admin sí o sí, así que nada de lo
; que sigue necesita su propia elevación anidada.
;
; Resumen tras reinicio: Docker Desktop necesita que WSL/Virtual Machine
; Platform ya estén REALMENTE activos (no solo "marcados para activar tras
; reinicio" por dism) antes de instalarse -- por eso el reinicio no puede
; moverse a después de instalar Docker, tiene que ir en el medio. Para que
; igual se sienta como una sola instalación continua, en vez de reabrir el
; wizard completo tras el reinicio (que exigiría un UAC y varios clics más),
; se programa una tarea de Windows (schtasks) que se ejecuta como SYSTEM al
; arrancar -- SYSTEM ya cuenta como admin para UAC.nsh, así que no hay
; ningún prompt ni ventana visible -- y retoma la instalación en modo
; silencioso (/OperaResume /S) justo donde quedó.
!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

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
  ; "1" cuando esta corrida es la tarea programada que retoma tras el
  ; reinicio (línea de comandos con /OperaResume), "0"/vacío en la corrida
  ; interactiva normal -- seteada en customInit, mucho antes de que exista
  ; ninguna página del wizard.
  Var IsResumeInstall
!endif

!macro customInit
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} "$R0" "/OperaResume" $R1
  ${If} ${Errors}
    StrCpy $IsResumeInstall "0"
  ${Else}
    StrCpy $IsResumeInstall "1"
  ${EndIf}
!macroend

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
      ; Consentimiento explícito de la licencia de Docker Desktop, no solo
      ; de "instalar algo más" -- InstallDockerDesktop corre el instalador
      ; oficial con --accept-license en nombre de quien tildó esta casilla
      ; (auditoría 2026-09-01, ronda 2, datos/legal P2). Herrajes Toro (el
      ; uso real de este instalador) califica como "empresa pequeña" bajo
      ; esa licencia -- ver ADR 0008.
      ${NSD_CreateLabel} 0 0 100% 66u "Opera necesita Docker Desktop para guardar su información. No lo encontramos instalado y funcionando en esta PC -- Opera puede instalarlo automáticamente (la descarga ya viene incluida en este instalador). Instalarlo desde acá acepta la licencia de Docker Desktop (docker.com/legal/docker-subscription-service-agreement). Si hace falta, la PC se va a reiniciar sola durante la instalación para terminar de activarlo."
      Pop $0
      ${NSD_CreateCheckbox} 0 70u 100% 12u "Instalar Docker Desktop automáticamente (acepta su licencia)"
      Pop $DockerCheckbox
      ${NSD_SetState} $DockerCheckbox ${BST_CHECKED}
      ${NSD_CreateCheckbox} 0 95u 100% 12u "Crear acceso directo en el escritorio"
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
  ${If} $IsResumeInstall == "1"
    ; Venimos de la tarea programada tras el reinicio -- confirmar que la
    ; corrida interactiva anterior de verdad dejó el checkbox de Docker
    ; tildado, no solo confiar en el flag de línea de comandos. Sin esto,
    ; cualquiera que ya pueda ejecutar el instalador con UAC podía correr
    ; "Opera-Setup.exe /OperaResume /S" directo, sin haber pasado nunca por
    ; el wizard, y aceptar la licencia de Docker Desktop en silencio sin que
    ; nadie la haya tildado (auditoría 2026-09-03, ronda 3).
    ${If} ${FileExists} "${DOCKER_CONSENT_MARKER}"
      !insertmacro InstallDockerDesktop
    ${Else}
      DetailPrint "Opera: se pidió retomar la instalación de Docker Desktop, pero no hay ningún consentimiento previo registrado -- se omite."
      !insertmacro CleanupResumeTask
    ${EndIf}
  ${Else}
    ${If} $ShortcutCheckboxState == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\Opera.lnk" "$INSTDIR\Opera.exe"
    ${EndIf}

    ${If} $DockerCheckboxState == ${BST_CHECKED}
      ; Se escribe ANTES de instalar -- es lo único que la corrida de resume
      ; (potencialmente días después, tras un reinicio) puede consultar para
      ; confirmar que esta decisión de verdad se tomó acá, tildando el
      ; checkbox, y no llegó por otro camino.
      FileOpen $0 "${DOCKER_CONSENT_MARKER}" w
      FileClose $0
      !insertmacro InstallDockerDesktop
    ${EndIf}
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

; Nombre fijo de la tarea programada usada para retomar tras el reinicio --
; el mismo nombre se usa para crearla acá y para borrarla en
; CleanupResumeTask una vez que ya no hace falta.
!define RESUME_TASK_NAME "OperaFinishSetup"

; Copia estable del propio instalador para que la tarea programada tenga algo
; que ejecutar después del reinicio aunque $EXEPATH (de dónde se lanzó
; originalmente, ej. un pendrive) ya no esté disponible.
!define RESUME_EXE_PATH "$INSTDIR\resources\OperaSetupResume.exe"

; Prueba de que la corrida interactiva tildó el checkbox de Docker antes de
; programar el reinicio -- la corrida de resume la exige antes de instalar
; Docker en silencio (ver customInstall). Vive junto al resto de los
; artefactos temporales de esta instalación, se borra en CleanupResumeTask.
!define DOCKER_CONSENT_MARKER "$INSTDIR\resources\.docker-consent-given"

!macro InstallDockerDesktop
  DetailPrint "Opera: activando Windows Subsystem for Linux..."
  nsExec::ExecToLog 'dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart'
  Pop $1

  DetailPrint "Opera: activando Virtual Machine Platform..."
  nsExec::ExecToLog 'dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart'
  Pop $0

  ; Hay que reiniciar ANTES de instalar Docker Desktop, no después: hasta que
  ; Windows no reinicia, las features recién activadas por dism no quedan
  ; realmente funcionando -- instalar Docker con --backend=wsl2 en ese estado
  ; (WSL "activado" en el registro pero no operativo todavía) es lo que hacía
  ; fallar la instalación completa en una PC que nunca tuvo WSL.
  ${If} $1 == ${DISM_REBOOT_REQUIRED}
  ${OrIf} $0 == ${DISM_REBOOT_REQUIRED}
    !insertmacro ScheduleResumeAndReboot
    Return
  ${EndIf}

  DetailPrint "Opera: instalando Docker Desktop (puede tardar varios minutos)..."
  ExecWait '"$INSTDIR\resources\docker\Docker Desktop Installer.exe" install --quiet --accept-license --backend=wsl2' $2
  DetailPrint "Opera: instalador de Docker Desktop terminó con código $2"

  !insertmacro CleanupResumeTask

  nsExec::ExecToLog 'docker info'
  Pop $0
  ${If} $0 != "0"
    ; Si esta corrida es la tarea programada tras el reinicio, corre como
    ; SYSTEM en la sesión 0 -- un MessageBox ahí no lo ve nadie y se queda
    ; esperando un clic que nunca llega, colgando la tarea para siempre. La
    ; app (backend-manager.ts) ya avisa en su propia UI si no encuentra
    ; Docker corriendo, así que alcanza con loguearlo acá.
    ${If} $IsResumeInstall == "1"
      DetailPrint "Opera: Docker Desktop no pudo iniciar (código docker info: $0) -- probablemente falte activar virtualización (Intel VT-x/AMD-V) en el BIOS/UEFI. Opera lo va a informar desde la app."
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Docker Desktop no pudo iniciar. La causa más común es que la virtualización (Intel VT-x/AMD-V) esté desactivada en el BIOS/UEFI de esta PC -- buscá una opción llamada algo como 'Intel Virtualization Technology', 'AMD-V' o 'SVM Mode' y activala ahí, después abrí Opera de nuevo."
    ${EndIf}
  ${EndIf}
!macroend

!macro ScheduleResumeAndReboot
  ; Si ya estamos en la corrida de resume, $EXEPATH ya ES la copia estable --
  ; copiarla sobre sí misma no hace falta (y podría fallar).
  ${If} $IsResumeInstall != "1"
    CopyFiles /SILENT "$EXEPATH" "${RESUME_EXE_PATH}"

    ; $INSTDIR es elegible por quien instala (allowToChangeInstallationDirectory
    ; en electron-builder.json5) -- si se instala fuera de "Program Files" (p.
    ; ej. una carpeta bajo Users\Public, escribible por cualquier cuenta local
    ; por defecto), cualquier usuario sin privilegios podría reemplazar este
    ; .exe antes del reinicio, y la tarea programada de más abajo lo ejecuta
    ; como SYSTEM sin ningún prompt -- escalación de privilegios completa
    ; (auditoría 2026-09-03, ronda 3). /inheritance:r corta la herencia de
    ; permisos de la carpeta contenedora; los SID están en inglés (S-1-5-18 =
    ; SYSTEM, S-1-5-32-544 = Administradores) para no depender del idioma de
    ; Windows.
    nsExec::ExecToLog 'icacls "${RESUME_EXE_PATH}" /inheritance:r /grant:r *S-1-5-18:(F) *S-1-5-32-544:(F)'
    Pop $0
  ${EndIf}

  ; /RU SYSTEM: sin contraseña que guardar, y SYSTEM ya cuenta como admin
  ; para UAC.nsh (multiUser.nsh) -- retoma sin ningún prompt ni ventana.
  ; /SC ONSTART: corre al arrancar Windows, sin depender de que alguien
  ; inicie sesión.
  nsExec::ExecToLog 'schtasks.exe /Create /F /RU SYSTEM /RL HIGHEST /SC ONSTART /TN "${RESUME_TASK_NAME}" /TR "\"${RESUME_EXE_PATH}\" /OperaResume /S"'
  Pop $0

  ${If} $IsResumeInstall != "1"
    ; Solo se ve en la corrida interactiva -- si esto disparara durante el
    ; propio resume (un segundo reinicio, rarísimo) correría como SYSTEM en
    ; sesión 0 y este MessageBox se quedaría colgado para siempre sin nadie
    ; que lo cierre.
    MessageBox MB_OK|MB_ICONINFORMATION "Windows necesita reiniciarse para terminar de activar Docker Desktop. La PC se va a reiniciar sola -- cuando vuelva a iniciar sesión, la instalación de Opera continúa sola, sin que haga falta hacer nada más."
  ${EndIf}
  Reboot
!macroend

!macro CleanupResumeTask
  nsExec::ExecToLog 'schtasks.exe /Delete /F /TN "${RESUME_TASK_NAME}"'
  Pop $0
  Delete "${RESUME_EXE_PATH}"
  Delete "${DOCKER_CONSENT_MARKER}"
!macroend
