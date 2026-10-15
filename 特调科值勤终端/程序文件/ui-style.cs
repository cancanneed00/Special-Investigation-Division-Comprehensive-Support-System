using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
namespace DutyUI {
 public static class Shape {
  public static GraphicsPath Round(Rectangle r,int radius){var p=new GraphicsPath();int d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 }
 public class SoftButton:Button {
  public SoftButton(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);}
  protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;g.Clear(Parent.BackColor);var r=new Rectangle(1,1,Width-3,Height-3);using(var p=Shape.Round(r,12)){using(var b=new SolidBrush(Enabled?BackColor:Color.FromArgb(45,49,53)))g.FillPath(b,p);using(var pen=new Pen(Focused?Color.FromArgb(237,216,165):Color.FromArgb(108,102,83)))g.DrawPath(pen,p);}TextRenderer.DrawText(g,Text,Font,r,Enabled?ForeColor:Color.FromArgb(146,150,151),TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);}
 }
 public class TaskCard:CheckBox {
  public TaskCard(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);Cursor=Cursors.Hand;}
  protected override void OnCheckedChanged(EventArgs e){base.OnCheckedChanged(e);Invalidate();}
  protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;g.Clear(Parent.BackColor);var r=new Rectangle(1,1,Width-3,Height-3);using(var p=Shape.Round(r,12)){using(var b=new SolidBrush(Checked?Color.FromArgb(222,208,171):Color.FromArgb(37,43,49)))g.FillPath(b,p);using(var pen=new Pen(Focused?Color.White:Checked?Color.FromArgb(219,192,130):Color.FromArgb(75,82,88),Focused?2:1))g.DrawPath(pen,p);}var ink=Checked?Color.FromArgb(34,38,42):Color.FromArgb(216,220,224);TextRenderer.DrawText(g,Text,Font,new Rectangle(16,0,Width-100,Height),ink,TextFormatFlags.Left|TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis);using(var f=new Font("Microsoft YaHei UI",9)){TextRenderer.DrawText(g,Checked?"✓ 已选":"未选择",f,new Rectangle(Width-83,0,75,Height),ink,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);}if(!Enabled)using(var b=new SolidBrush(Color.FromArgb(75,20,23,27)))g.FillRectangle(b,r);}
 }
 public class CardGroup:GroupBox {
  public CardGroup(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);}
  protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;g.Clear(Parent.BackColor);using(var p=Shape.Round(new Rectangle(0,0,Width-1,Height-1),16)){using(var b=new SolidBrush(BackColor))g.FillPath(b,p);using(var pen=new Pen(Color.FromArgb(61,68,74)))g.DrawPath(pen,p);}TextRenderer.DrawText(g,Text,Font,new Rectangle(16,10,Width-32,28),ForeColor,TextFormatFlags.Left|TextFormatFlags.VerticalCenter);}
 }
}
