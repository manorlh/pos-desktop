# -*- coding: utf-8 -*-
"""
מחולל קבצי ממשק פתוח - רשות המסים
יוצר קבצי INI.TXT ו-BKMVDATA.TXT בשלושה קידודים שונים
"""

import os
import zipfile

# תוכן קובץ INI.TXT
ini_content = """A000     000000000000008002233445123456789012345&OF1.31&12345678חשבשיר בע"מ        1.0                 987654321פרוגמטיקה          21F:\\OPENFRMT\\00223344.08\\091110251200999999999123456789          חנות דוגמה                                          רחוב הראשי          15        תל אביב                      12345   2008200801012008123120081011102500011ILS 0                                              
A100000000000000001
B100000000000000001
B110000000000000001
C100000000000000001
D110000000000000001
D120000000000000001
M100000000000000001
Z900000000000000001
"""

# תוכן קובץ BKMVDATA.TXT
bkmvdata_content = """A100000000001002233445123456789012345&OF1.31&                                                  
B100000000002002233445000000123400001חשבונית        1234              305 1234              חשבונית מכירה                            20081015200810151500            1000            +000000100000                  0          0          קבוצה א   2008101520081015משה כהן  
B1100000000030022334451500            חשבון קופה                                            רחוב אחד           1         תל אביב                      12345   ישראל                        IL                              +000001500000+000050000000+000030000000                                              0                                                                      
C100000000004002233445305001234            2008101520081025שם לקוח לדוגמה                                    רחוב הלקוח                                           5         ירושלים                      67890   ישראל                        IL054-12345678 123456789200810250000000001000000ILS+000000100000+000000000000+000000085000+000000015000+000000100000        לקוח001        התאמה001 0 20081025ענף001 משה כהן  0001234                   
D110000000005002233445305001234            0001                        מוצר לדוגמה                      יצרן א                                            12345678901234567890          יחידה              +000000010000000+000000010000+000000000000+000000010000001550ענף001 0 20081025ענף001                      
D120000000006002233445400002345            00011002233445  0012345678  001234567890123456789012008110100000000100000                                                                                        0 ענף001 0 20081025002345                                                            
M100000000007002233445                    קוד-יצרן-001        מק"ט001             נעליים ספורט                                      קוד-מיון-א  קטגוריה א                      יחידה              +000000050000+000000100000+000000080000001200000012000000                                                  
Z900000000008002233445123456789012345&OF1.31&000000000000008                                                  
"""

def create_files_with_encoding(encoding_name, encoding_code):
    """יצירת זוג קבצים בקידוד מסוים"""
    print(f"\n[{encoding_name}] יוצר קבצים...")
    
    # שמות קבצים
    ini_filename = f'tax_files/INI_{encoding_name}.TXT'
    bkmv_filename = f'tax_files/BKMVDATA_{encoding_name}.TXT'
    zip_filename = f'tax_files/BKMVDATA_{encoding_name}.zip'
    
    try:
        # יצירת INI
        with open(ini_filename, 'w', encoding=encoding_code, newline='\r\n') as f:
            f.write(ini_content)
        ini_size = os.path.getsize(ini_filename)
        print(f"   ✓ {ini_filename} ({ini_size} bytes)")
        
        # יצירת BKMVDATA
        with open(bkmv_filename, 'w', encoding=encoding_code, newline='\r\n') as f:
            f.write(bkmvdata_content)
        bkmv_size = os.path.getsize(bkmv_filename)
        print(f"   ✓ {bkmv_filename} ({bkmv_size} bytes)")
        
        # כיווץ BKMVDATA ל-ZIP
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(bkmv_filename, os.path.basename(bkmv_filename))
        zip_size = os.path.getsize(zip_filename)
        print(f"   ✓ {zip_filename} ({zip_size} bytes)")
        
        return True
        
    except Exception as e:
        print(f"   ✗ שגיאה: {e}")
        return False

def main():
    print("=" * 70)
    print("מחולל קבצי ממשק פתוח - רשות המסים בישראל")
    print("=" * 70)
    
    # יצירת תיקייה
    os.makedirs("tax_files", exist_ok=True)
    print(f"\nתיקייה נוצרה: {os.path.abspath('tax_files')}")
    
    # יצירת קבצים בשלושה קידודים
    encodings = [
        ("Win1255", "windows-1255", "הנפוץ ביותר - נסה ראשון"),
        ("ISO8859-8", "iso-8859-8", "קידוד ISO כפי שמופיע במסמך"),
        ("CP862", "cp862", "קידוד DOS")
    ]
    
    success_count = 0
    
    for i, (name, code, desc) in enumerate(encodings, 1):
        print(f"\n[{i}/3] {desc}")
        if create_files_with_encoding(name, code):
            success_count += 1
    
    # סיכום
    print("\n" + "=" * 70)
    print(f"הושלם! נוצרו {success_count * 3} קבצים ({success_count} זוגות)")
    print("=" * 70)
    
    print("\n📋 הקבצים שנוצרו:")
    print("-" * 70)
    
    for name, _, _ in encodings:
        ini_file = f'tax_files/INI_{name}.TXT'
        bkmv_file = f'tax_files/BKMVDATA_{name}.TXT'
        zip_file = f'tax_files/BKMVDATA_{name}.zip'
        
        if os.path.exists(ini_file):
            print(f"\nסט {name}:")
            print(f"  • {ini_file}")
            print(f"  • {bkmv_file}")
            print(f"  • {zip_file} ← העלה את זה לסימולטור")
    
    print("\n" + "=" * 70)
    print("🎯 סדר מומלץ לבדיקה:")
    print("=" * 70)
    print("1️⃣  נסה ראשון: INI_Win1255.TXT + BKMVDATA_Win1255.zip")
    print("2️⃣  אם לא עובד: INI_ISO8859-8.TXT + BKMVDATA_ISO8859-8.zip")
    print("3️⃣  אם עדיין לא: INI_CP862.TXT + BKMVDATA_CP862.zip")
    
    print("\n💡 טיפ: אם הסימולטור נותן שגיאת קידוד,")
    print("   נסה לפתוח את הקובץ ב-Notepad++ ולבדוק איזה קידוד הוא מזהה")
    print("=" * 70)

if __name__ == "__main__":
    main()