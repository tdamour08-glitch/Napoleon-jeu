<#
    servir.ps1 — serveur de fichiers statiques, sans rien installer.

    Windows ne fournit pas de serveur web en ligne de commande, mais
    PowerShell donne accès à HttpListener, ce qui suffit largement ici :
    le jeu n'a besoin que de fichiers servis avec le bon type MIME.

    Le point critique est le type des .js : servis autrement qu'en
    text/javascript, le navigateur refuse les modules ES et le jeu
    reste noir.

    Usage :
        powershell -ExecutionPolicy Bypass -File outils\servir.ps1
        powershell -ExecutionPolicy Bypass -File outils\servir.ps1 -Port 9000
        powershell -ExecutionPolicy Bypass -File outils\servir.ps1 -Reseau

    -Reseau ouvre le serveur aux autres appareils du réseau local
    (pour jouer depuis un portable ou une tablette). Il exige une
    console PowerShell lancée en administrateur.
#>

param(
    [int]    $Port   = 8000,
    [switch] $Reseau,
    # servir.bat ouvre lui-meme le navigateur, une fois le port a l'ecoute.
    [switch] $SansNavigateur
)

$ErrorActionPreference = 'Stop'

# La racine du site est le dossier parent de outils\.
$Racine = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
# Avec le separateur final : sans lui, « C:\jeu » laisserait passer « C:\jeu-piege ».
$RacinePrefixe = $Racine.TrimEnd('\') + '\'

$TypesMime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'   # indispensable aux modules ES
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.ico'  = 'image/x-icon'
    '.webp' = 'image/webp'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
    '.txt'  = 'text/plain; charset=utf-8'
    '.md'   = 'text/plain; charset=utf-8'
}

$Hote = if ($Reseau) { '+' } else { 'localhost' }
$ecouteur = New-Object System.Net.HttpListener
$ecouteur.Prefixes.Add("http://${Hote}:$Port/")

try {
    $ecouteur.Start()
} catch {
    Write-Host ''
    Write-Host "  Impossible d'ouvrir le port $Port." -ForegroundColor Red
    if ($Reseau) {
        Write-Host '  Le mode -Reseau exige une console PowerShell lancee en administrateur.'
    } else {
        Write-Host "  Le port est peut-etre deja pris : relancez avec -Port 8080."
    }
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host '  Les Aigles - serveur local' -ForegroundColor Yellow
Write-Host "  Dossier servi : $Racine"
Write-Host "  Adresse       : http://localhost:$Port/"
if ($Reseau) {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
           Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
           Select-Object -First 1 -ExpandProperty IPAddress)
    if ($ip) { Write-Host "  Sur le reseau : http://${ip}:$Port/" }
}
Write-Host '  Ctrl+C pour arreter.'
Write-Host ''

if (-not $SansNavigateur) { Start-Process "http://localhost:$Port/" }

while ($ecouteur.IsListening) {
    try {
        $contexte = $ecouteur.GetContext()
    } catch {
        break
    }

    $requete  = $contexte.Request
    $reponse  = $contexte.Response

    # Chemin demande, decode, sans la chaine de requete.
    $chemin = [System.Uri]::UnescapeDataString($requete.Url.AbsolutePath)
    if ($chemin -eq '/' -or $chemin.EndsWith('/')) { $chemin += 'index.html' }
    $chemin = $chemin.TrimStart('/').Replace('/', '\')

    $fichier = Join-Path $Racine $chemin

    # Garde-fou : rien en dehors du dossier du jeu.
    $resolu = $null
    try { $resolu = (Resolve-Path -LiteralPath $fichier -ErrorAction Stop).Path } catch { }

    if (-not $resolu -or -not $resolu.StartsWith($RacinePrefixe, [StringComparison]::OrdinalIgnoreCase) `
        -or -not (Test-Path -LiteralPath $resolu -PathType Leaf)) {
        $reponse.StatusCode = 404
        $corps = [System.Text.Encoding]::UTF8.GetBytes('404 - fichier introuvable')
        $reponse.ContentType = 'text/plain; charset=utf-8'
        $reponse.ContentLength64 = $corps.Length
        $reponse.OutputStream.Write($corps, 0, $corps.Length)
        $reponse.OutputStream.Close()
        Write-Host ("  404  " + $requete.Url.AbsolutePath) -ForegroundColor DarkGray
        continue
    }

    $extension = [System.IO.Path]::GetExtension($resolu).ToLowerInvariant()
    $type = $TypesMime[$extension]
    if (-not $type) { $type = 'application/octet-stream' }

    try {
        $octets = [System.IO.File]::ReadAllBytes($resolu)
        $reponse.StatusCode    = 200
        $reponse.ContentType   = $type
        $reponse.ContentLength64 = $octets.Length
        # Pas de cache : on veut voir ses modifications tout de suite.
        $reponse.AddHeader('Cache-Control', 'no-store')
        $reponse.OutputStream.Write($octets, 0, $octets.Length)
    } catch {
        $reponse.StatusCode = 500
    } finally {
        $reponse.OutputStream.Close()
    }
}

$ecouteur.Stop()
