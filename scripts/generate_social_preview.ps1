Add-Type -AssemblyName System.Drawing

$width = 1280
$height = 640

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Background color
$bgColor = [System.Drawing.ColorTranslator]::FromHtml("#090d16")
$g.Clear($bgColor)

# Gradient background glow
$rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
$glowColor1 = [System.Drawing.Color]::FromArgb(40, 99, 102, 241) # subtle indigo glow
$glowColor2 = [System.Drawing.Color]::FromArgb(0, 9, 13, 22)
$brushGlow = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $glowColor1, $glowColor2, 45.0)
$g.FillRectangle($brushGlow, $rect)

# Draw Title
$titleFont = New-Object System.Drawing.Font("Segoe UI", 30, [System.Drawing.FontStyle]::Bold)
$titleBrush = [System.Drawing.Brushes]::White
$g.DrawString("Vibe Multiagent", $titleFont, $titleBrush, 48, 28)

# Title accent icon/badge
$accentFont = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#38bdf8"))
$g.DrawString("LIVE CONTROL ROOM", $accentFont, $accentBrush, 430, 42)

# Subtitle
$subFont = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Regular)
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94a3b8"))
$g.DrawString("Multi-Agent Coding Orchestration for Claude Code, Codex & AGY (Zero Token Cost)", $subFont, $subBrush, 50, 78)

# Window frame coordinates
$winX = 48
$winY = 120
$winW = 1184
$winH = 490

# Window header bar
$winHeaderH = 32
$headerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#161e2e"))
$g.FillRectangle($headerBrush, $winX, $winY, $winW, $winHeaderH)

# Window dots
$dotRed = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#ef4444"))
$dotYellow = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#eab308"))
$dotGreen = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#22c55e"))
$g.FillEllipse($dotRed, $winX + 16, $winY + 11, 10, 10)
$g.FillEllipse($dotYellow, $winX + 34, $winY + 11, 10, 10)
$g.FillEllipse($dotGreen, $winX + 52, $winY + 11, 10, 10)

# Window title
$winTitleFont = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)
$winTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#64748b"))
$g.DrawString("Vibe-Multiagent Dashboard - Mission Control [LIVE]", $winTitleFont, $winTitleBrush, $winX + 75, $winY + 8)

# Window border
$borderPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#334155"), 1.5)
$g.DrawRectangle($borderPen, $winX, $winY, $winW, $winH)

# Draw Dashboard Image inside window
$framePath = "demo/frame_8s.png"
if (Test-Path $framePath) {
    $img = [System.Drawing.Image]::FromFile((Resolve-Path $framePath).Path)
    $imgX = [int]($winX + 1)
    $imgY = [int]($winY + $winHeaderH)
    $imgW = [int]($winW - 2)
    $imgH = [int]($winH - $winHeaderH - 1)
    $destRect = New-Object System.Drawing.Rectangle($imgX, $imgY, $imgW, $imgH)
    $g.DrawImage($img, $destRect)
    $img.Dispose()
}

$outputFile = "demo/social-preview.png"
$bmp.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
Write-Output "Generated: $outputFile"
