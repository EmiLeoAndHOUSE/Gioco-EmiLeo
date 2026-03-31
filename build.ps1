$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (Test-Path $cscPath) {
    & $cscPath /target:winexe /out:"c:\Users\Admin\OneDrive\Desktop\Gioco EmiLeo\GiocoEmiLeo.exe" "c:\Users\Admin\OneDrive\Desktop\Gioco EmiLeo\Launcher.cs"
    if ($?) {
        Write-Host "Successo! GiocoEmiLeo.exe  stato creato nella cartella del gioco." -ForegroundColor Green
    } else {
        Write-Error "Errore durante la compilazione."
    }
} else {
    Write-Error "Compilatore .NET non trovato."
}
