Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class LogoAligner
{
    private static bool Silver(Color c)
    {
        int max = Math.Max(c.R, Math.Max(c.G, c.B));
        int min = Math.Min(c.R, Math.Min(c.G, c.B));
        return c.A > 0 && max > 95 && (max - min) < 38;
    }

    public static void Align(string inputPath, string outputPath)
    {
        using (var src = new Bitmap(inputPath))
        {
            int w = src.Width;
            int h = src.Height;

            using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.DrawImage(src, 0, 0, w, h);
                }

                var car = new GraphicsPath();
                car.AddPolygon(new PointF[] {
                    new PointF(150,410), new PointF(160,360), new PointF(200,325),
                    new PointF(260,305), new PointF(320,295), new PointF(380,285),
                    new PointF(430,250), new PointF(480,220), new PointF(530,200),
                    new PointF(580,188), new PointF(640,182), new PointF(700,185),
                    new PointF(760,195), new PointF(810,205), new PointF(850,225),
                    new PointF(890,255), new PointF(930,285), new PointF(960,320),
                    new PointF(980,360), new PointF(985,405), new PointF(970,450),
                    new PointF(930,475), new PointF(860,495), new PointF(760,505),
                    new PointF(650,510), new PointF(540,510), new PointF(430,500),
                    new PointF(330,490), new PointF(250,480), new PointF(190,465),
                    new PointF(160,445)
                });

                // Remove the old silver arc outside the car. The car is restored below.
                for (int y = 0; y < Math.Min(365, h); y++)
                {
                    for (int x = 0; x < w; x++)
                    {
                        if (car.IsVisible(x, y)) continue;
                        Color c = bmp.GetPixel(x, y);
                        if (Silver(c)) bmp.SetPixel(x, y, Color.Transparent);
                    }
                }

                int cx = 622, cy = 320;
                int outerR = 310, innerR = 272;

                using (var arc = new Bitmap(w, h, PixelFormat.Format32bppArgb))
                {
                    using (var ag = Graphics.FromImage(arc))
                    {
                        ag.SmoothingMode = SmoothingMode.AntiAlias;
                        ag.PixelOffsetMode = PixelOffsetMode.HighQuality;

                        var outer = new RectangleF(cx - outerR, cy - outerR, outerR * 2, outerR * 2);
                        var inner = new RectangleF(cx - innerR, cy - innerR, innerR * 2, innerR * 2);

                        var ring = new GraphicsPath();
                        ring.AddArc(outer, 180, 180);
                        ring.AddArc(inner, 0, -180);
                        ring.CloseFigure();

                        using (var brush = new LinearGradientBrush(
                            new RectangleF(cx - outerR, cy - outerR, outerR * 2, outerR),
                            Color.FromArgb(255, 248, 248, 250),
                            Color.FromArgb(255, 118, 120, 126),
                            90f))
                        {
                            ag.FillPath(brush, ring);
                        }

                        using (var highlight = new Pen(Color.FromArgb(190, 255, 255, 255), 2.0f))
                        {
                            ag.DrawArc(highlight, outer, 180, 180);
                        }

                        using (var innerShadow = new Pen(Color.FromArgb(130, 64, 66, 72), 1.5f))
                        {
                            ag.DrawArc(innerShadow, inner, 180, 180);
                        }
                    }

                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.DrawImage(arc, 0, 0);
                        g.SetClip(car);
                        g.DrawImage(src, 0, 0, w, h);
                        g.ResetClip();
                    }
                }

                bmp.Save(outputPath, ImageFormat.Png);
            }
        }
    }
}
"@

if (-not ("LogoAligner" -as [type])) {
    Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing
}

[LogoAligner]::Align(
    (Resolve-Path "public\salvage-pulse-logo.png").Path,
    (Join-Path (Get-Location) "public\salvage-pulse-logo-aligned.png")
)
Write-Output "Wrote public\salvage-pulse-logo-aligned.png"
