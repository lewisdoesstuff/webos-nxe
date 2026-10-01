// Decompile chosen functions of an Xbox 360 basefile loaded raw into Ghidra.
//
//   xex1tool -b dash.exe dash.xex        (github.com/emoose/idaxex, builds with cmake)
//   analyzeHeadless <dir> proj -import dash.exe -loader BinaryLoader \
//     -loader-baseAddr 0x92000000 -processor PowerPC:BE:64:A2ALT-32addr -noanalysis
//   analyzeHeadless <dir> proj -process dash.exe -noanalysis -scriptPath tools/ghidra \
//     -postScript Decomp.java want.txt pdata.txt out.c
//
// want.txt lists function addresses in hex, one per line. pdata.txt is
// "<start> <length>" in hex per line, read from the basefile's .pdata section;
// a function missing from it (a leaf) is disassembled by flow instead.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.SourceType;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.cmd.function.CreateFunctionCmd;
import java.nio.file.*;
import java.util.*;

public class Decomp extends GhidraScript {
  public void run() throws Exception {
    String[] args = getScriptArgs();
    Map<Long, Long> pdata = new HashMap<>();
    for (String l : Files.readAllLines(Paths.get(args[1]))) {
      String[] p = l.trim().split(" ");
      pdata.put(Long.parseLong(p[0], 16), Long.parseLong(p[1], 16));
    }
    StringBuilder out = new StringBuilder();
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);
    for (String l : Files.readAllLines(Paths.get(args[0]))) {
      if (l.isBlank()) continue;
      long a = Long.parseLong(l.trim(), 16);
      Address ad = toAddr(a);
      Long len = pdata.get(a);
      Function f = getFunctionAt(ad);
      if (f == null) {
        if (len == null) {
          disassemble(ad);
          createFunction(ad, null);
        } else {
          AddressSet body = new AddressSet(ad, ad.add(len - 1));
          new DisassembleCommand(body, body, true).applyTo(currentProgram, monitor);
          new CreateFunctionCmd(null, ad, body, SourceType.USER_DEFINED).applyTo(currentProgram, monitor);
        }
        f = getFunctionAt(ad);
      }
      if (f == null) {
        out.append("// failed ").append(l).append("\n");
        continue;
      }
      DecompileResults r = di.decompileFunction(f, 120, monitor);
      out.append("// ==== ").append(l).append("\n");
      out.append(r.getDecompiledFunction() == null ? r.getErrorMessage() : r.getDecompiledFunction().getC()).append("\n");
    }
    Files.writeString(Paths.get(args[2]), out.toString());
  }
}
