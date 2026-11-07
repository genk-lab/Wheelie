Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Collections.Generic;
using System.Drawing;

public static class LogoAnalyzer
{
    private static bool Silver(Color c)
    {
        int max = Math.Max(c.R, Math.Max(c.G, c.B));
        int min = Math.Min(c.R, Math.Min(c.G, c.B));
        return max > 110 && (max - min) < 30;
    }

    private static bool Blue(Color c)
    {
        return c.B > 55 && c.B > c.R * 1.25 && c.B > c.G * 1.08;
    }

    private static string Fit(List<PointF> points)
    {
        double sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
        foreach (var p in points)
        {
            double x = p.X, y = p.Y, z = x * x + y * y;
            sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
            sxz += x * z; syz += y * z; sz += z;
        }
        int n = points.Count;
        double[,] a = {
            { 2 * sx, 2 * sy, n },
            { 2 * sxx, 2 * sxy, sx },
            { 2 * sxy, 2 * syy, sy }
        };
        double[] b = { sz, sxz, syz };
        // Gaussian elimination
        for (int i = 0; i < 3; i++)
        {
            int pivot = i;
            for (int j = i + 1; j < 3; j++) if (Math.Abs(a[j, i]) > Math.Abs(a[pivot, i])) pivot = j;
            for (int k = i; k < 3; k++) { double t = a[i, k]; a[i, k] = a[pivot, k]; a[pivot, k] = t; }
            double bt = b[i]; b[i] = b[pivot]; b[pivot] = bt;
            double div = a[i, i];
            for (int k = i; k < 3; k++) a[i, k] /= div;
            b[i] /= div;
            for (int j = 0; j < 3; j++)
            {
                if (j == i) continue;
                double factor = a[j, i];
                for (int k = i; k < 3; k++) a[j, k] -= factor * a[i, k];
                b[j] -= factor * b[i];
            }
        }
        double cx = b[0], cy = b[1], c = b[2];
        double r = Math.Sqrt(c + cx * cx + cy * cy);
        return String.Format("n={0} center=({1:F1},{2:F1}) radius={3:F1}", n, cx, cy, r);
    }

    public static string Analyze(string path)
    {
        using (var bmp = new Bitmap(path))
        {
            int w = bmp.Width, h = bmp.Height;
            var silverL = new List<PointF>();
            var silverR = new List<PointF>();
            var blueR = new List<PointF>();
            var blueB = new List<PointF>();

            for (int y = 30; y < Math.Min(180, h); y += 3)
            {
                int left = -1, right = -1;
                for (int x = 150; x < Math.Min(1250, w); x++)
                {
                    if (!Silver(bmp.GetPixel(x, y))) continue;
                    if (left < 0) left = x;
                    right = x;
                }
                if (left > 0) silverL.Add(new PointF(left, y));
                if (right > 0) silverR.Add(new PointF(right, y));
            }

            for (int y = 520; y < Math.Min(670, h); y += 2)
            {
                int right = -1;
                for (int x = 700; x < Math.Min(1000, w); x++)
                {
                    if (Blue(bmp.GetPixel(x, y))) right = x;
                }
                if (right > 0) blueR.Add(new PointF(right, y));
            }

            for (int x = 400; x < Math.Min(860, w); x += 4)
            {
                int bottom = -1;
                for (int y = 480; y < Math.Min(700, h); y++)
                {
                    if (Blue(bmp.GetPixel(x, y))) bottom = y;
                }
                if (bottom > 0) blueB.Add(new PointF(x, bottom));
            }

            return "Silver left: " + Fit(silverL) + "\n" +
                   "Silver right: " + Fit(silverR) + "\n" +
                   "Blue right: " + Fit(blueR) + "\n" +
                   "Blue bottom: " + Fit(blueB);
        }
    }
}
"@

if (-not ("LogoAnalyzer" -as [type])) {
    Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing
}
[LogoAnalyzer]::Analyze((Resolve-Path "public\salvage-pulse-logo.png").Path)

