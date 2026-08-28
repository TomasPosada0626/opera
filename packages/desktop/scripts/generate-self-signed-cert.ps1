<#
.SYNOPSIS
  Genera un certificado de firma de codigo auto-firmado para el instalador
  de Opera y lo exporta listo para usar con electron-builder.

.DESCRIPTION
  Opera se distribuye a una sola maquina (una empresa, un despliegue), no
  publicamente - un certificado real (OV/EV, de pago, requiere verificar
  una identidad legal) es una inversion que no tiene sentido para ese
  modelo. Un certificado auto-firmado, confiado a mano en esa unica
  maquina, resuelve el mismo problema real (Windows SmartScreen marcando
  el instalador como "editor desconocido", y no poder verificar que el
  instalador no fue alterado) sin ese costo.

  Este script:
    1. Crea un certificado de firma de codigo en el almacen del usuario.
    2. Lo exporta como .pfx (clave privada incluida - la usa
       electron-builder para firmar, NUNCA se comparte ni se sube al repo).
    3. Exporta tambien el .cer (solo la clave publica) - ese si se copia a
       la maquina donde se va a instalar Opera, para marcarlo confiable.

  NOTA de codificacion: este archivo se mantiene deliberadamente en ASCII
  puro (sin tildes, guiones largos ni comillas tipograficas). Windows
  PowerShell 5.1 lee un .ps1 sin BOM usando la codepage ANSI del sistema,
  no UTF-8 - un caracter no-ASCII ahi puede corromperse y romper el
  parseo del script en la maquina de otro usuario.

.PARAMETER Password
  Contrasena del .pfx. Si no se pasa, se pide de forma interactiva.

.EXAMPLE
  ./generate-self-signed-cert.ps1
#>
param(
  [securestring]$Password
)

$ErrorActionPreference = 'Stop'

if (-not $Password) {
  $Password = Read-Host -Prompt 'Contrasena para el certificado (.pfx)' -AsSecureString
}

$outDir = Join-Path $PSScriptRoot '..\certs'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host 'Creando certificado de firma de codigo...' -ForegroundColor Cyan
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject 'CN=Opera ERP (auto-firmado)' `
  -CertStoreLocation Cert:\CurrentUser\My `
  -NotAfter (Get-Date).AddYears(5) `
  -KeyUsage DigitalSignature `
  -KeyAlgorithm RSA `
  -KeyLength 2048

$pfxPath = Join-Path $outDir 'opera-code-signing.pfx'
$cerPath = Join-Path $outDir 'opera-code-signing.cer'

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $Password | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

# Limpieza: el certificado ya quedo exportado a disco, no hace falta
# dejarlo tambien en el almacen de certificados del usuario.
Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force

Write-Host ''
Write-Host 'Listo. Archivos generados en packages/desktop/certs/ (gitignored):' -ForegroundColor Green
Write-Host '  - opera-code-signing.pfx  (privado, NUNCA lo compartas ni lo subas al repo)'
Write-Host '  - opera-code-signing.cer  (publico, este es el que se instala en la maquina destino)'
Write-Host ''
Write-Host 'Para firmar el instalador, corre pnpm build con estas variables de entorno:' -ForegroundColor Cyan
Write-Host ('  $env:CSC_LINK = "{0}"' -f $pfxPath)
Write-Host '  $env:CSC_KEY_PASSWORD = "<la contrasena que usaste arriba>"'
Write-Host '  pnpm build'
Write-Host ''
Write-Host 'En la maquina donde se va a instalar Opera, para que Windows confie en el' -ForegroundColor Cyan
Write-Host 'instalador (quita la advertencia de SmartScreen), copia opera-code-signing.cer'
Write-Host 'ahi y corre, como Administrador:'
# Solo TrustedPublisher: es el almacen que Windows consulta para decidir
# si confia en la FIRMA de un ejecutable. Root ademas de innecesario es
# sobre-privilegio real: ese almacen es de autoridades certificadoras,
# le da a este certificado la capacidad de validar OTROS certificados,
# no solo firmar este instalador (senalado en la auditoria de seguridad).
Write-Host '  Import-Certificate -FilePath .\opera-code-signing.cer -CertStoreLocation Cert:\LocalMachine\TrustedPublisher'
