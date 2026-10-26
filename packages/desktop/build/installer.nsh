; Incluido por electron-builder (ver electron-builder.json5, nsis.include).
; Agrega, sobre el wizard NSIS que arma electron-builder solo:
;
;   1. Instalación silenciosa de Docker Desktop, solo si hace falta, con
;      consentimiento explícito en una página propia del wizard.
;   2. Casilla "crear acceso directo en el escritorio", marcada por defecto.
;   3. Si Windows necesita reiniciar para activar WSL/Virtual Machine
;      Platform, un reinicio automático que retoma la instalación solo --
;      ver "Resumen tras reinicio" más abajo.
;   4. La contraseña real de Postgres para esta máquina, generada una sola
;      vez acá (antes de que exista cualquier contenedor) y guardada con
;      permisos restringidos -- ver "Contraseña de Postgres" más abajo.
;   5. Aviso previo si la virtualización está apagada en el BIOS, permiso
;      de docker-users para la cuenta que va a usar Opera y pedido de
;      reinicio al terminar de instalar Docker Desktop (ver
;      DetectVirtualization/GrantDockerAccess).
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
;
; Lo que aprendimos en la primera PC real (2026-10-26), que este archivo ya
; corrige:
;   - Este instalador es de 32 bits: `dism.exe` y `wsl.exe` a secas
;     resolvían a C:\Windows\SysWOW64, y el dism de 32 bits se niega a
;     tocar un Windows de 64 bits (error 11). WSL nunca se activaba y el
;     reinicio nunca se programaba. Ahora van por $NativeSystemDir.
;   - Activar las features con dism ya no alcanza: desde Windows 11 22H2,
;     WSL es un paquete aparte (`wsl --install --no-distribution`). Sin él,
;     Docker Desktop abría con "WSL is not installed".
;   - La corrida de resume REINSTALA Opera, y la reinstalación vacía
;     $INSTDIR: las marcas de consentimiento/usuario que vivían ahí
;     desaparecían y el resume se salteaba Docker. Ahora viven en
;     %ProgramData%\Opera\setup (ver PrepareSetupStateDir).
;
; Contraseña de Postgres: tiene que ser UNA SOLA POR MÁQUINA, coordinada con
; el contenedor Docker (también por máquina) -- nunca generada por
; electron/backend-manager.ts en el primer arranque de cada cuenta de
; Windows, porque dos cuentas en una PC compartida generarían cada una la
; suya, y ninguna coincidiría con la que el contenedor fija de verdad en su
; `initdb`. Se genera y guarda ACÁ, en el instalador (que ya corre elevado,
; antes de que exista cualquier contenedor todavía), en la carpeta
; ProgramData de Windows (resuelta en runtime -- ver ProvisionPostgresSecret
; más abajo, NSIS no tiene una constante fija para esa ruta), con permisos
; restringidos vía icacls -- mismo patrón que PrepareSetupStateDir más abajo. Ver
; el comentario espejo en backend-manager.ts
; (ensureMachineWidePostgresPassword) para el resto del razonamiento
; (auditoría 2026-09-05, ronda 4).
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
  ; "0" solo si se pudo comprobar que la virtualización está apagada en el
  ; BIOS; "1" si está activa o no se pudo saber (no se asusta a nadie por
  ; una consulta que falló).
  Var VirtualizationReady
  ; "1" cuando esta corrida es la tarea programada que retoma tras el
  ; reinicio (línea de comandos con /OperaResume), "0"/vacío en la corrida
  ; interactiva normal -- seteada en customInit, mucho antes de que exista
  ; ninguna página del wizard.
  Var IsResumeInstall
  ; C:\Windows\System32 de verdad (el de 64 bits): este instalador es de 32
  ; bits, y para él "System32" es SysWOW64 -- ver customInit.
  Var NativeSystemDir
  ; %ProgramData%\Opera\setup: lo que la corrida de resume necesita
  ; encontrar después del reinicio (ver PrepareSetupStateDir).
  Var SetupStateDir
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

  ; "Sysnative" es el alias que Windows le da a un proceso de 32 bits para
  ; llegar al System32 real; solo existe en un Windows de 64 bits.
  StrCpy $NativeSystemDir "$WINDIR\System32"
  ${If} ${FileExists} "$WINDIR\Sysnative\cmd.exe"
    StrCpy $NativeSystemDir "$WINDIR\Sysnative"
  ${EndIf}

  ; Misma cadena de respaldo que ProvisionPostgresSecret más abajo.
  ExpandEnvStrings $R0 "%ProgramData%"
  ${If} $R0 == "%ProgramData%"
    ExpandEnvStrings $R0 "%ALLUSERSPROFILE%"
    ${If} $R0 == "%ALLUSERSPROFILE%"
      StrCpy $R0 "C:\ProgramData"
    ${EndIf}
  ${EndIf}
  StrCpy $SetupStateDir "$R0\Opera\setup"
!macroend

!macro customPageAfterChangeDir
  Page custom OperaOptionsPageCreate OperaOptionsPageLeave

  Function OperaOptionsPageCreate
    ; Se chequea acá (no antes) porque recién ahora, en runtime, sabemos si
    ; hace falta ofrecer instalar Docker -- en build time no hay forma de
    ; saberlo.
    ; "Ya está" = instalado, aunque no esté corriendo en este momento: Opera
    ; lo abre sola cuando lo necesita (ver ensureDockerRunning en
    ; backend-manager.ts). Antes solo contaba si `docker info` respondía, y
    ; reinstalar Opera con Docker cerrado ofrecía reinstalar Docker entero.
    StrCpy $DockerAlreadyRunning "0"
    ${If} ${FileExists} "$PROGRAMFILES64\Docker\Docker\Docker Desktop.exe"
      StrCpy $DockerAlreadyRunning "1"
    ${Else}
      nsExec::ExecToLog 'docker info'
      Pop $0
      ${If} $0 == "0"
        StrCpy $DockerAlreadyRunning "1"
      ${EndIf}
    ${EndIf}

    StrCpy $VirtualizationReady "1"
    ${If} $DockerAlreadyRunning == "0"
      !insertmacro DetectVirtualization
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
      ${NSD_CreateLabel} 0 0 100% 54u "Opera guarda su información con Docker Desktop, que no está instalado en esta PC. Este instalador ya lo trae incluido: deja marcada la primera casilla para instalarlo ahora (necesita internet para descargar WSL de Microsoft). Al hacerlo aceptas la licencia de Docker Desktop (docker.com/legal/docker-subscription-service-agreement). Si Windows lo necesita, la PC se reinicia sola y la instalación sigue después."
      Pop $0
      ${NSD_CreateCheckbox} 0 58u 100% 12u "Instalar Docker Desktop (acepto su licencia)"
      Pop $DockerCheckbox
      ${NSD_SetState} $DockerCheckbox ${BST_CHECKED}
      ${NSD_CreateCheckbox} 0 76u 100% 12u "Crear acceso directo en el escritorio"
      Pop $ShortcutCheckbox
      ${NSD_SetState} $ShortcutCheckbox ${BST_CHECKED}
      ${If} $VirtualizationReady == "0"
        ${NSD_CreateLabel} 0 96u 100% 40u "Atención: la virtualización parece estar desactivada en el BIOS de esta PC, y sin ella Docker Desktop no arranca. Puedes seguir con la instalación; antes de abrir Opera, actívala en el BIOS/UEFI (busca una opción como Intel Virtualization Technology, AMD-V o SVM Mode)."
        Pop $0
      ${EndIf}
    ${Else}
      ${NSD_CreateLabel} 0 0 100% 24u "Docker Desktop ya está instalado en esta PC. Opera lo usa tal como está y lo abre sola cuando hace falta."
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
  ; Idempotente (no pisa un secreto ya provisionado) -- segura de llamar acá
  ; sin importar si esta corrida es interactiva o de resume.
  !insertmacro ProvisionPostgresSecret

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
      !insertmacro PrepareSetupStateDir
      ; Se escribe ANTES de instalar -- es lo único que la corrida de resume
      ; (potencialmente días después, tras un reinicio) puede consultar para
      ; confirmar que esta decisión de verdad se tomó acá, tildando el
      ; checkbox, y no llegó por otro camino.
      FileOpen $0 "${DOCKER_CONSENT_MARKER}" w
      FileClose $0
      !insertmacro RememberInteractiveUser
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
!define RESUME_EXE_PATH "$SetupStateDir\OperaSetupResume.exe"

; Prueba de que la corrida interactiva tildó el checkbox de Docker antes de
; programar el reinicio -- la corrida de resume la exige antes de instalar
; Docker en silencio (ver customInstall). Se borra en CleanupResumeTask.
!define DOCKER_CONSENT_MARKER "$SetupStateDir\docker-consent-given"

; La cuenta de Windows que va a usar Opera, anotada en la corrida
; interactiva: la corrida de resume corre como SYSTEM tras el reinicio y no
; tiene forma de saber quién instaló. Se borra en CleanupResumeTask.
!define DOCKER_USER_MARKER "$SetupStateDir\docker-user"

; La carpeta de las marcas y de la copia del instalador, fuera de $INSTDIR
; (la corrida de resume reinstala Opera y vacía $INSTDIR antes de llegar a
; customInstall). Se arma de cero y se restringe a SYSTEM/Administradores
; ANTES de escribir nada: la tarea programada ejecuta como SYSTEM lo que
; haya ahí, así que una cuenta común no debe poder tocarlo. Borrarla
; primero descarta una carpeta que alguien haya creado antes con sus
; propios permisos. Los SID en vez de nombres: no dependen del idioma de
; Windows.
!macro PrepareSetupStateDir
  RMDir /r "$SetupStateDir"
  CreateDirectory "$SetupStateDir"
  nsExec::ExecToLog 'icacls "$SetupStateDir" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)(F) *S-1-5-32-544:(OI)(CI)(F)'
  Pop $0
!macroend

; Si la virtualización está apagada en el BIOS, Docker Desktop se instala
; bien pero nunca arranca. Se avisa ANTES de instalar, en la página de
; opciones: antes el aviso salía después de instalar, con un `docker info`
; que fallaba siempre (Docker recién instalado todavía no está corriendo),
; así que asustaba incluso en PCs donde todo estaba bien.
; HypervisorPresent cubre el caso en que WSL/Hyper-V ya están activos (ahí
; Windows reporta VirtualizationFirmwareEnabled en falso aunque funcione).
!macro DetectVirtualization
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$cs=Get-CimInstance Win32_ComputerSystem;$$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1;if($$cs.HypervisorPresent -or $$cpu.VirtualizationFirmwareEnabled){Write-Host -NoNewline 1}else{Write-Host -NoNewline 0}"'
  Pop $0
  Pop $1
  ${If} $0 == "0"
  ${AndIf} $1 == "0"
    StrCpy $VirtualizationReady "0"
  ${EndIf}
!macroend

; Win32_ComputerSystem.UserName es la cuenta con la sesión abierta en la
; PC, aunque el UAC se haya aceptado con otra cuenta de administrador (ahí
; %USERNAME% sería el del administrador, no el de quien va a usar Opera).
!macro RememberInteractiveUser
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Write-Host -NoNewline (Get-CimInstance Win32_ComputerSystem).UserName"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
  ${OrIf} $1 == ""
    ExpandEnvStrings $1 "%USERDOMAIN%\%USERNAME%"
  ${EndIf}
  FileOpen $2 "${DOCKER_USER_MARKER}" w
  FileWrite $2 "$1"
  FileClose $2
!macroend

; Docker Desktop solo deja usarlo a las cuentas del grupo docker-users. Su
; instalador agrega a quien lo ejecuta, que en la corrida de resume es
; SYSTEM, no la persona: sin esto, después del reinicio Opera nunca podía
; hablar con Docker. Si ya era miembro, `net` falla sin consecuencias.
!macro GrantDockerAccess
  ${If} ${FileExists} "${DOCKER_USER_MARKER}"
    FileOpen $2 "${DOCKER_USER_MARKER}" r
    FileRead $2 $1
    FileClose $2
    ${If} $1 != ""
      nsExec::ExecToLog 'net localgroup docker-users "$1" /add'
      Pop $0
    ${EndIf}
  ${EndIf}
!macroend

; Ver el comentario grande al principio del archivo ("Contraseña de
; Postgres") para el razonamiento completo. Genera la contraseña real de
; esta máquina UNA SOLA VEZ (idempotente -- si el archivo ya existe, no hace
; nada) y la guarda con permisos restringidos.
!macro ProvisionPostgresSecret
  ; NSIS no tiene una constante $COMMONAPPDATA -- $APPDATA cambia de
  ; significado según SetShellVarContext (current/all), un estado global que
  ; no conviene asumir acá (el propio template de electron-builder lo toca
  ; por su cuenta). Se resuelve %ProgramData% como variable de entorno en
  ; vez de depender de eso -- mismo criterio y misma cadena de respaldo que
  ; machineSecretPath() en backend-manager.ts, para que ambos lados calculen
  ; exactamente la misma ruta en la misma máquina.
  ExpandEnvStrings $R0 "%ProgramData%"
  ${If} $R0 == "%ProgramData%"
    ExpandEnvStrings $R0 "%ALLUSERSPROFILE%"
    ${If} $R0 == "%ALLUSERSPROFILE%"
      StrCpy $R0 "C:\ProgramData"
    ${EndIf}
  ${EndIf}
  StrCpy $R1 "$R0\Opera"
  StrCpy $R2 "$R1\postgres-secret.json"

  ${IfNot} ${FileExists} "$R2"
    CreateDirectory "$R1"

    ; RNGCryptoServiceProvider vía PowerShell -- disponible en cualquier
    ; Windows moderno sin depender de ningún plugin NSIS extra. "$$" escapa
    ; el "$" para PowerShell (NSIS lo interpretaría como variable propia
    ; si no). Base64 sin "+"/"/"/"=" (reemplazados) para que entre sin
    ; escapar en una URL de conexión postgresql://user:pass@... y en un
    ; argumento de `docker run`. "Write-Host -NoNewline" a propósito -- el
    ; eco automático de una expresión de PowerShell agrega un salto de
    ; línea al final, que rompería el JSON de abajo si quedara adentro del
    ; valor.
    nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$b=New-Object byte[](24);[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($$b);$$p=([Convert]::ToBase64String($$b)).Replace(\"+\",\"A\").Replace(\"/\",\"B\").Replace(\"=\",\"\");Write-Host -NoNewline $$p"'
    Pop $0 ; código de salida
    Pop $1 ; stdout capturado -- la contraseña generada, sin salto de línea

    ; Si PowerShell falla (bloqueado por política de grupo, ausente, lo que
    ; sea) NO se escribe un archivo con una contraseña vacía o con el texto
    ; de un error adentro -- eso rompería el JSON en silencio y dejaría un
    ; secreto inválido que backend-manager.ts leería como si fuera bueno.
    ; Sin este archivo, ensureMachineWidePostgresPassword() se autoprovisiona
    ; sola en el primer arranque (mismo camino que dev/testing sin pasar por
    ; el instalador) -- se prefiere ESO antes que escribir algo roto acá
    ; (revisión propia post-ronda-4, 2026-09-06).
    ${If} $0 == "0"
    ${AndIf} $1 != ""
      ; Ventana TOCTOU aceptada (auditoría 2026-09-06, ronda 5, Seguridad
      ; P2): entre este FileWrite y el icacls que sigue, el archivo existe
      ; un instante con la contraseña en texto plano y el ACL heredado (sin
      ; restringir todavía) de la carpeta recién creada. Explotarla exige
      ; monitorear activamente la creación de este archivo durante un UAC
      ; que la mayoría ve terminar en segundos -- riesgo bajo, aceptado en
      ; vez de dejarlo implícito. (La copia del instalador para el resume ya
      ; no tiene esta ventana: ver PrepareSetupStateDir.)
      FileOpen $2 "$R2" w
      FileWrite $2 '{"postgresPassword":"$1"}'
      FileClose $2

      ; SYSTEM/Administradores control total, cuentas locales comunes (Users,
      ; SID S-1-5-32-545) solo lectura -- necesitan poder leerlo para que
      ; Opera arranque en esa cuenta, pero no para modificarlo. Mismos SID
      ; que PrepareSetupStateDir más abajo.
      nsExec::ExecToLog 'icacls "$R2" /inheritance:r /grant:r *S-1-5-18:(F) *S-1-5-32-544:(F) *S-1-5-32-545:(R)'
      Pop $0
    ${Else}
      DetailPrint "Opera: no se pudo generar la contraseña de Postgres vía PowerShell (código $0) -- Opera la va a generar sola en su primer arranque."
    ${EndIf}
  ${EndIf}
!macroend

!macro InstallDockerDesktop
  ; ¿WSL ya funciona? `wsl --status` sale con 0 solo si el paquete de WSL
  ; está instalado y operativo. Solo en la corrida interactiva: la de resume
  ; corre como SYSTEM, donde `wsl` no es confiable, y para entonces todo lo
  ; de WSL ya se hizo antes del reinicio (preguntarlo ahí podía pedir otro
  ; reinicio, y otro, para siempre).
  StrCpy $3 "0"
  ${If} $IsResumeInstall != "1"
    nsExec::ExecToLog '"$NativeSystemDir\wsl.exe" --status'
    Pop $3
  ${EndIf}

  DetailPrint "Opera: activando Windows Subsystem for Linux..."
  nsExec::ExecToLog '"$NativeSystemDir\dism.exe" /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart'
  Pop $1

  DetailPrint "Opera: activando Virtual Machine Platform..."
  nsExec::ExecToLog '"$NativeSystemDir\dism.exe" /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart'
  Pop $0

  ; El paquete de WSL en sí, que las features de arriba no traen. Lo baja
  ; de Microsoft (necesita internet). `--update` es el respaldo para un
  ; Windows cuyo wsl.exe no conoce --no-distribution.
  ${If} $3 != "0"
    DetailPrint "Opera: instalando WSL (lo descarga de Microsoft, puede tardar unos minutos)..."
    nsExec::ExecToLog '"$NativeSystemDir\wsl.exe" --install --no-distribution'
    Pop $4
    ${If} $4 != "0"
      nsExec::ExecToLog '"$NativeSystemDir\wsl.exe" --update'
      Pop $4
    ${EndIf}
    DetailPrint "Opera: la instalación de WSL terminó con código $4"
  ${EndIf}

  ; Hay que reiniciar ANTES de instalar Docker Desktop, no después: hasta que
  ; Windows no reinicia, las features recién activadas por dism no quedan
  ; realmente funcionando -- instalar Docker con --backend=wsl2 en ese estado
  ; (WSL "activado" en el registro pero no operativo todavía) es lo que hacía
  ; fallar la instalación completa en una PC que nunca tuvo WSL. Lo mismo si
  ; WSL no funcionaba al empezar: lo que se acaba de instalar recién queda
  ; activo después del reinicio.
  ${If} $1 == ${DISM_REBOOT_REQUIRED}
  ${OrIf} $0 == ${DISM_REBOOT_REQUIRED}
  ${OrIf} $3 != "0"
    !insertmacro ScheduleResumeAndReboot
    Return
  ${EndIf}

  DetailPrint "Opera: instalando Docker Desktop (puede tardar varios minutos)..."
  ExecWait '"$INSTDIR\resources\docker\Docker Desktop Installer.exe" install --quiet --accept-license --backend=wsl2' $2
  DetailPrint "Opera: instalador de Docker Desktop terminó con código $2"

  ; Antes se seguía igual y se decía "Docker Desktop quedó instalado" aunque
  ; su instalador hubiera fallado. 3010 = terminó bien pero pide reiniciar.
  ${If} $2 != "0"
  ${AndIf} $2 != ${DISM_REBOOT_REQUIRED}
    !insertmacro CleanupResumeTask
    ${If} $IsResumeInstall != "1"
      MessageBox MB_OK|MB_ICONEXCLAMATION "No se pudo instalar Docker Desktop (código $2). Opera sí quedó instalada: descarga Docker Desktop de docker.com/products/docker-desktop, instálalo, reinicia la PC y abre Opera."
    ${EndIf}
    Return
  ${EndIf}

  !insertmacro GrantDockerAccess
  !insertmacro CleanupResumeTask

  ; Ya instalado, el instalador de Docker no hace falta (y antes del
  ; Reboot de abajo, que corta la instalación ahí mismo).
  Delete "$INSTDIR\resources\docker\Docker Desktop Installer.exe"
  RMDir "$INSTDIR\resources\docker"

  ; El permiso de docker-users recién instalado solo vale en sesiones
  ; nuevas de Windows: hasta reiniciar (o cerrar sesión), Docker rechaza a
  ; la cuenta y Opera no puede arrancar. En la corrida de resume no se
  ; pregunta nada: corre como SYSTEM en la sesión 0, donde un MessageBox no
  ; lo ve nadie y colgaría la tarea para siempre.
  ${If} $IsResumeInstall != "1"
    ${If} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION "Docker Desktop quedó instalado. Para que Opera pueda usarlo, Windows necesita reiniciar.$\r$\n$\r$\n¿Reiniciar ahora? Si eliges No, reinicia la PC antes de abrir Opera." IDYES`
      Reboot
    ${EndIf}
  ${EndIf}
!macroend

!macro ScheduleResumeAndReboot
  ; Si ya estamos en la corrida de resume, $EXEPATH ya ES la copia estable --
  ; copiarla sobre sí misma no hace falta (y podría fallar).
  ${If} $IsResumeInstall != "1"
    ; La tarea programada de más abajo ejecuta este .exe como SYSTEM sin
    ; ningún prompt: si una cuenta común pudiera reemplazarlo antes del
    ; reinicio, sería una escalación de privilegios completa (auditoría
    ; 2026-09-03, ronda 3). Vive en $SetupStateDir, que PrepareSetupStateDir
    ; ya dejó restringida a SYSTEM/Administradores ANTES de esta copia: el
    ; archivo nace con ese ACL heredado, sin la ventana TOCTOU que tenía
    ; cuando se copiaba a $INSTDIR y se restringía después.
    CopyFiles /SILENT "$EXEPATH" "${RESUME_EXE_PATH}"
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
    MessageBox MB_OK|MB_ICONINFORMATION "Windows necesita reiniciarse para activar los componentes que usa Docker Desktop. La PC se va a reiniciar ahora; al encender de nuevo, la instalación termina sola en unos minutos. Espera un momento antes de abrir Opera."
  ${EndIf}
  Reboot
!macroend

!macro CleanupResumeTask
  nsExec::ExecToLog 'schtasks.exe /Delete /F /TN "${RESUME_TASK_NAME}"'
  Pop $0
  ; /REBOOTOK: en la corrida de resume, la copia del instalador es el
  ; propio proceso que está corriendo -- Windows la borra al reiniciar.
  Delete /REBOOTOK "${RESUME_EXE_PATH}"
  Delete "${DOCKER_CONSENT_MARKER}"
  Delete "${DOCKER_USER_MARKER}"
  RMDir /REBOOTOK "$SetupStateDir"
!macroend
