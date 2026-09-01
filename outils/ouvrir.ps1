<#
    ouvrir.ps1 — attend que le serveur reponde, puis ouvre le navigateur.

    Lance par servir.bat en arriere-plan. Sans cette attente, le
    navigateur s'ouvrait avant que le serveur n'ait pris le port et
    affichait « Ce site est inaccessible ».
#>

param(
    [int] $Port    = 8000,
    [int] $Secondes = 20
)

$echeance = (Get-Date).AddSeconds($Secondes)

while ((Get-Date) -lt $echeance) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $Port)
        $client.Close()
        Start-Process "http://localhost:$Port/"
        exit 0
    } catch {
        Start-Sleep -Milliseconds 250
    } finally {
        $client.Dispose()
    }
}

Write-Host ''
Write-Host "  Le serveur n'a pas repondu sur le port $Port en $Secondes secondes." -ForegroundColor Red
Write-Host '  Regardez le message affiche plus haut dans cette fenetre.'
Write-Host ''
