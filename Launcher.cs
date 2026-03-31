using System;
using System.Diagnostics;
using System.IO;

public class Launcher {
    public static void Main() {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string htmlPath = Path.Combine(baseDir, "index.html");

        if (File.Exists(htmlPath)) {
            string htmlUrl = "file:///" + htmlPath.Replace('\\', '/');
            string args = "--app=\"" + htmlUrl + "\"";
            
            // Common Browser Paths for App Mode
            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
            string chromePath64 = @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";

            try {
                if (File.Exists(edgePath)) {
                    Process.Start(edgePath, args);
                } else if (File.Exists(chromePath)) {
                    Process.Start(chromePath, args);
                } else if (File.Exists(chromePath64)) {
                    Process.Start(chromePath64, args);
                } else {
                    // Standard fallback
                    Process.Start(new ProcessStartInfo(htmlPath) { UseShellExecute = true });
                }
            } catch (Exception) {
                // Last resort fallback
                Process.Start(new ProcessStartInfo("cmd", "/c start \"\" \"" + htmlPath + "\"") { CreateNoWindow = true });
            }
        }
    }
}
